/**
 * Wake the API as early as possible in the app's own startup.
 *
 * The API runs on a free tier that sleeps after a spell of no traffic, and the
 * first request after that pays a cold start measured in tens of seconds. The
 * user doesn't have to pay it, though: the app fires this the moment it
 * launches — before fonts finish, before the session resolves, before any
 * screen asks for data — so the wake-up overlaps with the seconds the person
 * spends looking at the home screen rather than blocking their first tap.
 *
 * Deliberately fire-and-forget:
 *  - it hits `/health`, which never touches the database, so it can't be a
 *    slow query and can't wake the API only to make it wait on Postgres;
 *  - it never throws, because failing to warm is not an error the user needs;
 *  - it carries no auth, because it runs before the session is known.
 *
 * `isLikelyCold()` lets a screen say something honest while the wait is long,
 * instead of showing a spinner that implies something is broken.
 */

const HEALTH_TIMEOUT_MS = 45_000;

/** When the warm-up started, so a screen can tell a cold start from a hang. */
let startedAt: number | null = null;
let awake = false;
let inFlight: Promise<void> | null = null;

function healthUrl(): string | null {
  const base = process.env.EXPO_PUBLIC_API_URL;
  return base ? `${base.replace(/\/+$/, "")}/health` : null;
}

/**
 * Ping the API so it starts waking. Safe to call repeatedly — a second call
 * while one is in flight joins the first rather than piling on requests.
 */
export function warmApi(): Promise<void> {
  if (awake) return Promise.resolve();
  if (inFlight) return inFlight;

  const url = healthUrl();
  if (url === null) return Promise.resolve();

  startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  inFlight = fetch(url, { signal: controller.signal })
    .then((res) => {
      if (res.ok) awake = true;
    })
    .catch(() => {
      // Offline, or the wake-up outlasted the timeout. Either way the screens
      // handle their own failures honestly; there is nothing to report here.
    })
    .finally(() => {
      clearTimeout(timer);
      inFlight = null;
    });

  return inFlight;
}

/**
 * Whether we're plausibly still waiting on a cold start — the warm-up has been
 * running a while and hasn't answered yet.
 *
 * A screen uses this to say "the server is waking up" instead of leaving a
 * spinner that reads as "this is broken". It's a heuristic, and it's honest
 * about being one: it says what we're waiting for, not that we know.
 */
export function isLikelyCold(thresholdMs = 3000): boolean {
  if (awake || startedAt === null) return false;
  return Date.now() - startedAt > thresholdMs;
}

/** True once the API has answered at least once this session. */
export function apiIsAwake(): boolean {
  return awake;
}

/** Test seam — resets the module's memory between cases. */
export function __resetWarmup(): void {
  startedAt = null;
  awake = false;
  inFlight = null;
}
