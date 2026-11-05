/**
 * DEMO ONLY — three made-up people for recording the client walkthrough video.
 *
 *   Maya Adeyemi  member, two weeks of history, linked to both of the below
 *   Sam Levy      PT, listed coach, teaches classes at the demo studio
 *   Biomeds       the doctor (shown only by the clinic name)
 *
 * Writes go through the app's own procedures wherever one exists, called as the
 * demo users — so validation, readiness snapshots and audit rows are the real
 * thing (the PT and the doctor opening Maya's record is what fills her
 * "Who has looked"). Only what has no procedure — staff capability, links,
 * backdated gym visits — is written directly, mirroring admin.grantStaff and
 * an accepted invite.
 *
 * It never touches real rows: no venue is hidden, and `clean` deletes only the
 * ids this script recorded (a name match could be a real clinic's venue).
 *
 * Run (from apps/api):  pnpm exec tsx scripts/demo-video.ts seed
 * Undo everything:      pnpm exec tsx scripts/demo-video.ts clean
 *
 * Logins are printed and kept in scripts/.demo-state.json (git-ignored). Not the
 * OS temp dir: Windows cleans that, and losing the file loses what to undo.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Role, StaffKind, StaffLinkStatus, StaffStatus, CheckInSource } from "@prisma/client";
import { isoWeek } from "@pulse/shared";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { appRouter } from "../src/router";
import type { Context } from "../src/context";

const STATE = fileURLToPath(new URL(".demo-state.json", import.meta.url));

const PEOPLE = {
  maya: { email: "maya.demo@example.com", name: "Maya Adeyemi" },
  sam: { email: "sam.demo@example.com", name: "Sam Levy" },
  biomeds: { email: "biomeds.demo@example.com", name: "Biomeds" },
} as const;
type Who = keyof typeof PEOPLE;

type State = {
  ids: Record<Who, string>;
  passwords: Record<Who, string>;
  venueId: string | null;
};

/* ---------------- helpers ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
/** Device-local YYYY-MM-DD, n days ago (the phone and this laptop share a zone). */
function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** A local wall-clock instant, n days from today, as ISO. */
function at(daysFromToday: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

async function auth(pathname: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin${pathname}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok && res.status !== 404) throw new Error(`auth ${pathname}: ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 404 ? null : res.json();
}

function caller(id: string, role: Role, staff: StaffKind[] = []) {
  const ctx: Context = {
    user: { id, email: "", role, staff: staff.map((kind) => ({ kind })) } as Context["user"],
  };
  return appRouter.createCaller(ctx);
}

const step = (msg: string) => console.log(`  · ${msg}`);

/* ---------------- seed ---------------- */

async function seed() {
  if (existsSync(STATE)) throw new Error(`demo already seeded (${STATE}) — run "clean" first`);
  const clash = await prisma.user.findMany({
    where: { email: { in: Object.values(PEOPLE).map((p) => p.email) } },
    select: { email: true },
  });
  if (clash.length) throw new Error(`demo users already exist: ${clash.map((c) => c.email).join(", ")} — run "clean"`);

  // 1. Logins. The signup trigger creates each public.users row.
  const ids = {} as Record<Who, string>;
  const passwords = {} as Record<Who, string>;
  for (const who of Object.keys(PEOPLE) as Who[]) {
    const p = PEOPLE[who];
    passwords[who] = `Demo${randomBytes(6).toString("hex")}`;
    const u = (await auth("/users", {
      method: "POST",
      body: JSON.stringify({
        email: p.email,
        password: passwords[who],
        email_confirm: true,
        user_metadata: { full_name: p.name },
      }),
    })) as { id: string };
    ids[who] = u.id;
  }
  const state: State = { ids, passwords, venueId: null };
  writeFileSync(STATE, JSON.stringify(state, null, 2)); // from here on, `clean` can undo
  for (let i = 0; i < 20; i++) {
    const n = await prisma.user.count({ where: { id: { in: Object.values(ids) } } });
    if (n === 3) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  step("3 logins created");

  // 2. Capability and links — what admin.grantStaff and an accepted invite write.
  for (const [who, kind] of [["sam", StaffKind.PT], ["biomeds", StaffKind.PRACTITIONER]] as const) {
    await prisma.staffProfile.create({
      data: { userId: ids[who], kind, status: StaffStatus.VERIFIED, verifiedAt: new Date() },
    });
    await prisma.staffLink.create({
      data: {
        clientId: ids.maya,
        staffId: ids[who],
        role: kind === StaffKind.PT ? Role.PT : Role.PRACTITIONER,
        kind,
        status: StaffLinkStatus.ACTIVE,
        createdAt: new Date(Date.now() - 40 * 86_400_000),
      },
    });
  }
  step("Sam = PT, Biomeds = doctor, both linked to Maya");

  const maya = caller(ids.maya, Role.USER);
  const sam = caller(ids.sam, Role.USER, [StaffKind.PT]);
  // ADMIN only in this in-memory context, to call admin.saveVenue below. The
  // account itself stays USER: a demo login must never hold real admin rights.
  const doc = caller(ids.biomeds, Role.ADMIN, [StaffKind.PRACTITIONER]);

  // 3. What Maya shares: activity with her PT, health with Biomeds; diagnostics
  //    and photos with no one — so both staff screens show a "not shared" line.
  for (const [category, audience] of [
    ["ACTIVITY", "TRAINER"],
    ["BIOMETRICS", "PRACTITIONER"],
    ["JOURNAL", "PRACTITIONER"],
    ["DIAGNOSTICS", "NONE"],
    ["PHOTOS", "NONE"],
  ] as const) {
    await maya.consent.set({ category, audience });
  }
  step("consents set");

  // 4. Two weeks of history. Resting HR first, so each check-in's readiness
  //    snapshot is computed with it. Energy is low (2) on 3 of the last 5 days —
  //    enough for exactly one suggestion (Energy review); sleep stays ≥ 6.5h and
  //    readiness ≥ 50 so no other protocol trips. Today is left for the video.
  const plan: { n: number; sleep: number; q: number; energy: number; mood: number; hr: number }[] = [
    { n: 13, sleep: 7.5, q: 4, energy: 4, mood: 4, hr: 61 },
    { n: 12, sleep: 7, q: 4, energy: 4, mood: 4, hr: 62 },
    { n: 11, sleep: 8, q: 5, energy: 5, mood: 4, hr: 60 },
    { n: 10, sleep: 7, q: 3, energy: 3, mood: 3, hr: 62 },
    { n: 9, sleep: 7.5, q: 4, energy: 4, mood: 4, hr: 61 },
    { n: 8, sleep: 8, q: 4, energy: 4, mood: 5, hr: 60 },
    { n: 7, sleep: 7, q: 4, energy: 3, mood: 4, hr: 61 },
    { n: 6, sleep: 7.5, q: 4, energy: 4, mood: 4, hr: 61 },
    { n: 5, sleep: 7, q: 3, energy: 3, mood: 3, hr: 62 },
    { n: 4, sleep: 6.5, q: 3, energy: 2, mood: 3, hr: 63 },
    { n: 3, sleep: 7, q: 3, energy: 2, mood: 3, hr: 63 },
    { n: 2, sleep: 7.5, q: 4, energy: 4, mood: 4, hr: 61 },
    { n: 1, sleep: 6.5, q: 3, energy: 2, mood: 3, hr: 62 },
  ];
  for (const d of plan) {
    await maya.metrics.log({ type: "RESTING_HR", value: d.hr, recordedAt: at(-d.n, 7, 10), source: "MANUAL" });
    await maya.metrics.log({ type: "SLEEP_HOURS", value: d.sleep, recordedAt: at(-d.n, 7, 10), source: "MANUAL" });
  }
  // No reading for today: readiness scores from whatever it has, and a heart
  // rate alone reads as 100 before she has checked in. Leaving today empty
  // means Home opens on "Awaiting" and the check-in on camera produces the score.
  let kg = 69.2;
  for (const d of plan) {
    kg = Math.round((kg - 0.08) * 10) / 10;
    await maya.logs.checkin({
      date: day(d.n),
      sleepHours: d.sleep,
      sleepQuality: d.q,
      energy: d.energy,
      mood: d.mood,
      weightKg: d.n % 3 === 0 ? kg : null,
    });
  }
  step("13 days of check-ins + heart rate");

  // 5. Goal, supplement stack, meals.
  await maya.goals.set({ description: "Lose 4kg and tone up", targetMetric: "WEIGHT" });
  for (const s of [
    { name: "Vitamin D3", dose: "2000 IU", timings: ["AM"], note: "Winter levels" },
    { name: "Omega-3", dose: "1 g", timings: ["AM"] },
    { name: "Creatine", dose: "5 g", timings: ["PRE"] },
    { name: "Magnesium glycinate", dose: "300 mg", timings: ["PM"], note: "Helps me wind down" },
  ] as const) {
    await maya.supplements.add({ ...s, timings: [...s.timings] });
  }
  const meals: { n: number; description: string; calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number }[] = [
    { n: 1, description: "Overnight oats with berries", calories: 410, proteinG: 18, carbsG: 62, fatG: 10, fiberG: 9 },
    { n: 1, description: "Chicken and quinoa bowl", calories: 590, proteinG: 42, carbsG: 58, fatG: 18, fiberG: 8 },
    { n: 1, description: "Salmon, sweet potato and greens", calories: 640, proteinG: 38, carbsG: 52, fatG: 26, fiberG: 9 },
    { n: 0, description: "Greek yogurt, granola and honey", calories: 380, proteinG: 22, carbsG: 48, fatG: 9, fiberG: 4 },
    { n: 0, description: "Turkey and avocado wrap", calories: 520, proteinG: 34, carbsG: 46, fatG: 20, fiberG: 7 },
  ];
  for (const m of meals) {
    const { n, ...rest } = m;
    await maya.nutrition.log({ ...rest, date: day(n), estimated: false });
  }
  step("goal, 4 supplements, 5 meals");

  // 6. Training week, generated by the app, with this week's earlier sessions done.
  await maya.fitness.week({ date: day(0) });
  const sessions = await prisma.fitnessSession.findMany({
    where: { userId: ids.maya, rest: false },
    select: { date: true },
  });
  const today = day(0);
  for (const s of sessions) {
    const d = s.date.toISOString().slice(0, 10);
    if (d < today) await maya.fitness.complete({ date: d, feedback: "JUST_RIGHT" });
  }
  step(`training week generated, ${sessions.filter((s) => s.date.toISOString().slice(0, 10) < today).length} earlier session(s) completed`);

  // 7. The studio, its classes, Sam's coach profile.
  await doc.admin.saveVenue({ name: "Biomeds Studio", address: "Marylebone, London", timezone: "Europe/London", active: true });
  const venue = await prisma.venue.findFirstOrThrow({ where: { name: "Biomeds Studio" }, orderBy: { createdAt: "desc" } });
  state.venueId = venue.id;
  writeFileSync(STATE, JSON.stringify(state, null, 2));

  await sam.gym.saveCoachProfile({
    displayName: "Sam Levy",
    bio: "Strength and conditioning coach. Steady, sustainable programmes built around how you feel each day.",
    specialties: ["strength", "conditioning", "mobility"],
    bookingUrl: null,
  });
  await sam.gym.setListed({ listed: true });

  const classes: { d: number; h: number; m?: number; title: string; desc: string; dur: number; cap: number }[] = [
    { d: 1, h: 7, title: "Strength Foundations", desc: "Squat, hinge, push and pull — technique first.", dur: 50, cap: 12 },
    { d: 1, h: 18, title: "HIIT Express", desc: "Thirty minutes, intervals you can scale.", dur: 30, cap: 16 },
    { d: 2, h: 7, m: 30, title: "Mobility Flow", desc: "Slow, guided mobility for hips and shoulders.", dur: 45, cap: 14 },
    { d: 3, h: 9, title: "Strength Foundations", desc: "Squat, hinge, push and pull — technique first.", dur: 50, cap: 12 },
    { d: 4, h: 10, title: "Mobility Flow", desc: "Slow, guided mobility for hips and shoulders.", dur: 45, cap: 14 },
  ];
  const created: string[] = [];
  for (const c of classes) {
    const r = (await sam.gym.createClass({
      venueId: venue.id,
      title: c.title,
      description: c.desc,
      startsAt: at(c.d, c.h, c.m ?? 0),
      durationMin: c.dur,
      capacity: c.cap,
    })) as { id: string };
    created.push(r.id);
  }
  // Maya is already booked onto tomorrow morning's class; the video books another.
  await maya.gym.book({ classId: created[0]! });
  for (const n of [2, 5, 8]) {
    await prisma.gymVisit.create({
      data: { userId: ids.maya, venueId: venue.id, source: CheckInSource.QR, checkedInAt: new Date(at(-n, 7, 5)) },
    });
  }
  step(`studio + ${created.length} classes, Sam listed, Maya booked, 3 past visits`);

  // 8. Sam's plan and note for Maya, then both staff open her record — the
  //    genuine reads that fill her access record.
  await sam.training.savePlan({
    clientId: ids.maya,
    week: isoWeek(),
    title: "Strength base",
    items: [
      { name: "Goblet squat", sets: 3, reps: 10 },
      { name: "Romanian deadlift", sets: 3, reps: 8 },
      { name: "Push-up", sets: 3, reps: 12 },
      { name: "Dead bug", sets: 3, reps: 10 },
    ],
  });
  await sam.training.addNote({
    clientId: ids.maya,
    body: "Great session on Monday — keep the squats slow on the way down. We'll add a little load next week.",
    sharedWithClient: true,
  });
  await sam.staff.client({ clientId: ids.maya });
  await doc.staff.client({ clientId: ids.maya });
  step("Sam's plan + note; both staff opened Maya's record");

  console.log("\nDemo ready. Logins (also in " + STATE + "):");
  for (const who of Object.keys(PEOPLE) as Who[]) {
    console.log(`  ${PEOPLE[who].name.padEnd(13)} ${PEOPLE[who].email.padEnd(28)} ${passwords[who]}`);
  }
}

/* ---------------- clean ---------------- */

async function clean() {
  const saved: State | null = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(PEOPLE).map((p) => p.email) } },
    select: { id: true },
  });
  const ids = [...new Set([...users.map((u) => u.id), ...(saved ? Object.values(saved.ids) : [])])];

  // Audit rows have no FK (they outlive accounts by design), so remove the demo's explicitly.
  if (ids.length) {
    const a = await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { subjectId: { in: ids } }] } });
    step(`${a.count} audit rows`);
  }
  // Venue is Restrict from classes and visits: visits, then classes (bookings cascade), then the venue.
  // Only the id this script recorded — never a name match, which could be the
  // clinic's own venue. Without the state file the demo venue is left in place.
  const venueIds = saved?.venueId ? [saved.venueId] : [];
  if (!saved) step("no state file: demo venue (if any) left in place — remove it in admin Venues");
  if (venueIds.length) {
    await prisma.gymVisit.deleteMany({ where: { venueId: { in: venueIds } } });
    await prisma.gymClass.deleteMany({ where: { venueId: { in: venueIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    step("demo studio, classes and visits");
  }
  if (ids.length) {
    await prisma.gymVisit.deleteMany({ where: { userId: { in: ids } } });
    await prisma.gymClass.deleteMany({ where: { coachId: { in: ids } } });
    const u = await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades their own data
    step(`${u.count} demo users and everything they owned`);
    for (const id of ids) await auth(`/users/${id}`, { method: "DELETE" });
    step("logins deleted");
  }
  if (existsSync(STATE)) rmSync(STATE);
  console.log("Demo removed.");
}

/* ---------------- main ---------------- */

const cmd = process.argv[2];
(cmd === "seed" ? seed() : cmd === "clean" ? clean() : Promise.reject(new Error("usage: demo-video.ts seed|clean")))
  .catch((e: unknown) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    console.error('Run "clean" to undo a partial seed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
