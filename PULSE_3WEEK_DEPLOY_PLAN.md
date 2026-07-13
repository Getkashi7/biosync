# Pulse — 3-Week Deploy Plan (the "what to build")

Companion to `CLAUDE_CODE_PROMPTS_WEEK1.md` (the "how to drive Claude Code"). The prompts say
"Read PULSE_3WEEK_DEPLOY_PLAN.md, Day N" — this file is the Day N spec they load. Source of
truth for stack/conventions is `CLAUDE.md`; this file is scope + sequencing only.

## How to use
- One day-slice = one fresh Claude Code session, launched from the **repo root**.
- The closing ritual, every slice: Claude Code builds → **you verify on the S23** → paste the
  "Verified" prompt → commit + tag. Never skip the middle step.
- Out-of-scope ideas that surface mid-slice go to `LATER.md`, not into the current session.

## Where the repo actually is (2026-07-13)
- **Mobile:** Expo SDK 54, Expo Router, auth flow complete, dark design tokens in
  `apps/mobile/src/ui/theme.ts`, a working daily check-in (`src/features/checkin/`), a 5-tab
  shell (`src/features/app/MainTabs.tsx`) where Home/Calendar/Chat/Profile are placeholders.
- **API:** tRPC v11 + Prisma v6. Auth + `DailyLog` check-in only (`logs.checkin`, `logs.streak`).
  No `Metric`/`Goal`/readiness yet.
- **Shared:** `@pulse/shared` holds zod check-in schemas + streak logic.
- **Data model direction:** add a generalized `Metric` + `Goal` model *alongside* `DailyLog`.
  `DailyLog` = subjective daily check-in (sleep, quality, energy, mood, weight). `Metric` =
  objective point measurements (resting HR, HRV, glucose, hydration, weight) that later come
  from device sources. Readiness reads from both.

---

# Week 1 — core loop on the phone

## Day 1 — Unblock the phone (commit + verify; SDK is already on 54)
**Goal:** bank the uncommitted check-in work and prove the core loop runs on the S23.
- Commit ALL uncommitted work on `main` ("feat: daily check-in slice").
- Run API (`pnpm --filter @pulse/api dev`, port 4000) + mobile (`pnpm --filter mobile start -c`),
  same Wi-Fi. Scan in Expo Go (SDK 54).
- **Verify on S23:** sign in → Log tab → complete a check-in → confirm it persists across a
  restart.
- Tag `checkin-verified`.
- **Your two manual jobs:** (1) confirm Play Console account is personal vs organization —
  personal accounts made after Nov 2023 need a 14-day closed test before production; (2) put
  "privacy policy + account-deletion pages" on the calendar for ~Day 13–14 (both URLs required
  for the store listing).

## Day 2 — Metric logging slice (QuickLog)
- **Prisma (`apps/api`):** `enum MetricType { SLEEP_HOURS SLEEP_QUALITY RESTING_HR HRV GLUCOSE
  WEIGHT HYDRATION ENERGY MOOD }`, `enum MetricSource { MANUAL HEALTH_CONNECT APPLE_HEALTH OURA
  WHOOP LIBRE }`, `model Metric` (id, userId, type, value Float, source default MANUAL,
  recordedAt, `@@index([userId, type, recordedAt])`), `model Goal` (id, userId, description,
  targetMetric MetricType?, createdAt). Real migration `0003_metrics` — never `db push`.
- **Shared (`packages/shared`):** zod schemas for metric-log and metric-range inputs, exported
  alongside the existing check-in schemas.
- **tRPC:** `metricsRouter` with `metrics.log` and `metrics.range` — `userProcedure`, userId
  ALWAYS from `ctx.user`, never from client input. Mount next to `logs`.
- **Mobile:** a QuickLog bottom-sheet mirroring `src/features/checkin/CheckinSheet.tsx` +
  `checkinApi.ts`, for the point metrics NOT already in the check-in: resting HR, weight,
  optional HRV + glucose. Reuse design tokens + primitives (GradientSlider, EnergyDots,
  GradientButton, SuccessCheck). Success toast + error state. Add an entry point to open it.
- **Tests:** both procedures, incl. rejecting a spoofed userId and invalid/out-of-range input.
- Tag `metrics-log`.

## Day 3 — Readiness score + dashboard shell
- **tRPC `readiness.today`** (`userProcedure`): 0–100, computed server-side.
  40% last night's sleep hours vs 8h target (DailyLog), 20% sleep quality (DailyLog), 20%
  resting HR vs this user's trailing-14-day baseline (Metric `RESTING_HR`), 20% latest
  energy/mood (DailyLog). Missing component → reweight across present ones; `lowConfidence: true`
  when fewer than two components present. Return `{ score, breakdown, lowConfidence }`.
- **Mobile:** build the Home tab (today a Placeholder) into a dashboard — a readiness ring
  (theme reserves ring colors; add the ring in `src/ui`), today's logged numbers beneath, a
  "log your first metrics" empty state that opens QuickLog, a low-confidence hint when flagged.
- **Tests:** formula with full data, each missing-component combination, and the baseline calc.
- Tag `readiness-v1`.

## Day 4 — Trends + journal timeline
- Install `react-native-gifted-charts` — confirm SDK 54 / New Architecture compatibility first;
  propose an alternative before installing if problematic.
- Add a read-back query if missing (e.g. `logs.range` for check-in history) so the UI can chart.
- Trend cards: 7-day line charts for sleep hours, resting HR, weight (`metrics.range` + check-in
  history). Empty states under 3 points ("log a few more days to see trends").
- Timeline (wire up the Calendar tab): merge daily check-ins + logged metrics into one
  reverse-chronological feed — the symptom-journal surface.
- Tag `trends-v1`.

## Day 5 — Buffer, hardening, week tag
- `pnpm typecheck`, `pnpm lint`, `pnpm test` across the monorepo — fix everything red.
- Audit the week's screens (QuickLog, dashboard, trends, timeline) for missing loading states,
  unhandled errors, keyboard covering inputs, and any `console.log` that could contain a health
  value (remove them). Punch list ranked by user impact; fix the top, put the rest in `LATER.md`.
- Tag `week1-core`.

---

# Week 2 — depth + go native (Days 6–10) — outline, refine as you go

- **Day 6 — Goals:** use the `Goal` model from Day 2. `goals.set` / `goals.list`
  (`userProcedure`, zod). Mobile: a goals surface + tie a goal to readiness/trends.
- **Day 7 — Profile & settings:** build the Profile tab (today a Placeholder): account info,
  units (kg/lb), sign out, delete-account entry point (wired to real deletion in Week 3).
- **Day 8 — Insights / Chat tab:** turn the Chat placeholder into the spec's insight surface
  (start read-only: surface streak + readiness trend as plain-language insights).
- **Day 9 — Reminders:** local notification to nudge the daily check-in (respect quiet hours).
- **Day 10 — Leave managed workflow:** add `expo-dev-client`, run `prebuild`, produce the first
  EAS **development** build and confirm it runs on the S23. (The pack scheduled dev-client here.)

# Week 3 — ship (Days 11–15) — outline, refine as you go

- **Day 11 — EAS production config:** app icon + splash, prod API URL/env, release channel,
  crash/error reporting.
- **Day 12 — First production build + internal install:** EAS production build; install and
  smoke-test the full loop on the S23.
- **Day 13–14 — Legal + store listing:** host privacy policy + account-deletion pages (both
  URLs required), implement real account deletion, write the store listing (title, description,
  screenshots), complete the Play Data Safety form.
- **Day 15 — Closed test upload + buffer:** upload to the Play Console closed-testing track
  (start the 14-day clock if your account is personal); fix anything the pre-launch report flags.

---

## Conventions (from CLAUDE.md — enforced every slice)
- Strict TypeScript + `noUncheckedIndexedAccess`. Validate all external input with zod at the
  tRPC boundary. `userId` from session, never from client input; authz in middleware.
- Never hard-code color/spacing/duration — import from `src/ui/theme.ts`.
- No health values in any log statement. Schema changes ship a migration, never `db push`.
- Every change passes `pnpm typecheck` and `pnpm test` before it's done. Commit only when asked.
