/**
 * The body cap must not be able to kill the process.
 *
 * The cap used to be a hand-rolled stream guard in `server.ts`: a `data`
 * listener that counted bytes and sent 413 once the total passed the limit.
 * That made it a remote kill switch. `data` keeps firing for chunks already in
 * flight, so the listener ran again after the response had ended,
 * `res.setHeader` threw ERR_HTTP_HEADERS_SENT from inside an event handler,
 * nothing caught it, and the process exited — the whole API, for every user,
 * from one **unauthenticated** request with a chunked body and no
 * Content-Length. Anyone who could reach the URL could take the service down in
 * a loop, and the only trace was a restart.
 *
 * These drive real sockets against a real server, because the bug was in the
 * timing of Node's stream events: a fake request object can't reproduce it, and
 * a mocked one proves nothing. The guard that replaced it is `maxBodySize` on
 * the tRPC handler, which stops reading at the cap inside the adapter.
 *
 * `uncaughtException` is captured here rather than left to the runner, so the
 * assertion is "the server threw nothing out of band", not "the test file
 * happened to survive". Note that nothing in `app.ts` installs a process-level
 * handler — the one in `server.ts` is the production backstop, and if it were
 * in scope here it would hide exactly the regression these tests exist for.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../db", () => ({
  prisma: { $queryRaw: () => Promise.resolve([{ ok: 1 }]) },
}));

const { createApiServer, MAX_BODY_BYTES } = await import("../app");

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Anything the server throws outside a request handler. Must stay empty. */
let uncaught: unknown[] = [];
const collect = (err: unknown) => uncaught.push(err);

beforeEach(() => {
  uncaught = [];
  process.on("uncaughtException", collect);
});

afterEach(() => {
  process.off("uncaughtException", collect);
});

type Outcome = { status: number | null; reset: boolean };

/**
 * `agent: false` on every request below, so each one gets its own socket.
 * Node's global agent keeps sockets alive and pools them; an oversized request
 * can leave its socket half-closed, and the next test then reuses it and waits
 * for a reply that will never come. That is an artefact of sharing one client
 * agent across these cases, not something a real client does to itself, but it
 * will hang this file if the pooling comes back.
 */
const FRESH = { agent: false as const, host: "127.0.0.1" };

/**
 * POST a body in chunks with `Transfer-Encoding: chunked` and no
 * Content-Length — the shape the declared-length check cannot see.
 */
function postChunked(path: string, totalBytes: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        ...FRESH,
        port,
        method: "POST",
        path,
        headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? null, reset: false }));
      },
    );
    req.on("error", () => resolve({ status: null, reset: true }));

    const chunk = "x".repeat(16 * 1024);
    req.write('{"messages":"');
    for (let sent = 0; sent < totalBytes; sent += chunk.length) req.write(chunk);
    req.end('"}');
  });
}

/** POST a small body that *claims* to be huge. */
function postDeclaring(path: string, declaredBytes: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        ...FRESH,
        port,
        method: "POST",
        path,
        headers: { "content-type": "application/json", "content-length": String(declaredBytes) },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? null, reset: false }));
      },
    );
    req.on("error", () => resolve({ status: null, reset: true }));
    req.end("{}");
  });
}

function get(path: string): Promise<{ status: number | null; body: string }> {
  return new Promise((resolve) => {
    http
      .get({ ...FRESH, port, path }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode ?? null, body }));
      })
      .on("error", () => resolve({ status: null, body: "" }));
  });
}

describe("oversized request bodies", () => {
  it("survives a chunked body far over the cap, and still serves everyone else", async () => {
    const outcome = await postChunked("/trpc/logs.checkin", MAX_BODY_BYTES * 4);

    // The regression: this used to be an ERR_HTTP_HEADERS_SENT that unwound
    // past the request and exited the process.
    expect(uncaught).toEqual([]);
    // Answered, not reset — 401, because the caller has no token and the
    // middleware rejects before the body is ever consumed. (An *authenticated*
    // oversized body is what `maxBodySize` turns into a 413; getting there
    // needs a signed token, which this DB-free suite has no way to mint.)
    expect(outcome.reset).toBe(false);
    expect(outcome.status).toBe(401);
    // The point of all of it: the next user's request still works.
    await expect(get("/health")).resolves.toMatchObject({ status: 200 });
  });

  it("survives the same body aimed at a path that does not exist", async () => {
    const outcome = await postChunked("/trpc/nope.nothing", MAX_BODY_BYTES * 4);

    expect(uncaught).toEqual([]);
    expect(outcome.reset).toBe(false);
    expect(outcome.status).toBe(404);
    await expect(get("/health")).resolves.toMatchObject({ status: 200 });
  });

  it("refuses a declared oversized body with 413, before reading it", async () => {
    const outcome = await postDeclaring("/trpc/logs.checkin", MAX_BODY_BYTES + 1);

    expect(outcome.status).toBe(413);
    expect(uncaught).toEqual([]);
  });

  it("still accepts a normal request, so the cap hasn't broken ordinary traffic", async () => {
    // Unauthenticated, so the answer is 401 — what matters is that the body was
    // read and routed rather than refused by a cap that is too eager.
    const outcome = await postChunked("/trpc/logs.checkin", 1024);

    expect(outcome.reset).toBe(false);
    expect(outcome.status).toBe(401);
    expect(uncaught).toEqual([]);
  });
});
