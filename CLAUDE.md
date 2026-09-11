# BIOSYNC — Engineering Guide (CLAUDE.md)

BIOSYNC is a health app ("Your body, decoded."). This monorepo holds the mobile client and its
API. This file is the source of truth for stack and conventions — follow it.

## Naming — BIOSYNC on the outside, `pulse` in the identifiers

The app was renamed from Pulse to **BIOSYNC**. The rename deliberately stopped at user-facing
surfaces: `app.json` `name`, the Render service, and product copy say BIOSYNC.

Everything identifier-shaped still says `pulse` **on purpose** — root package `pulse-app`,
workspaces `@pulse/api` and `@pulse/shared`, Expo `slug`/`scheme` `pulse`, bundle id
`app.pulse.mobile`, EAS project `@kaze7777/pulse`. The `pulse://` scheme is baked into the
installed dev client's deep link, and the bundle id is what Play Store installs key on: renaming
them forces a new native build and breaks the device dev flow. **These are not leftovers — don't
"tidy" them.**

## Monorepo

- **pnpm workspaces + Turborepo.** Node ≥ 20, `pnpm@9`. Never use `npm`/`yarn` here.
- Layout:
  - `apps/mobile` — Expo (SDK 54) React Native app, Expo Router, TypeScript.
  - `apps/api` — standalone `@trpc/server` Node HTTP server + Prisma (Supabase Postgres).
  - `packages/shared` (`@pulse/shared`) — Zod schemas + pure logic (check-in validation, streak)
    shared by the API and, type-only, the mobile client. Consumed as raw TS source; no build step.
- Root scripts run through Turbo: `pnpm typecheck`, `pnpm test`, `pnpm lint`. **There is no build
  step** — the API runs straight off `tsx`, `@pulse/shared` is raw TS, and the mobile app is built
  by EAS. No workspace has a `build` script, so don't add a root one that resolves to nothing.
  Scope one workspace with `pnpm --filter mobile <script>` / `pnpm --filter @pulse/api <script>`.

## Versions — do not drift

- **`expo` is pinned to exactly `54.0.8`**, `@expo/metro-runtime` to `6.1.2`. The device's dev build
  is compiled against SDK 54 — drifting the JS SDK past it breaks the runtime at launch.
- **Never** run `expo install --fix`, `expo upgrade`, or `pnpm update expo`: they silently resolve to
  the latest 54.0.x and break the device. If you must reinstall, pin exactly (`pnpm add -E`).
- Hold the SDK-54 baseline: `expo-router ~6.0.x`, `react-native 0.81.x`, `react 19.1.0`,
  `react-native-reanimated ~4.1.x` + `react-native-worklets 0.5.1`.

## Local dev & device testing (Windows)

- **Testing runs on the EAS development build** (a standalone BIOSYNC app already installed on the
  S23) — **not Expo Go** (Day 10 left the managed workflow; native modules like `expo-notifications`
  can't run in Expo Go). The dev Wi-Fi router uses client isolation, so **LAN/QR and `--tunnel`
  don't work**; the dev client reaches Metro through `adb reverse` tunnels instead. Those tunnels
  work over either transport — **wireless debugging is preferred**, USB is the fallback:
  1. Connect the device.
     - *Wireless (preferred):* `adb mdns services` to find the phone, then `adb connect <ip:port>`.
       Pairing is one-time (Settings → Developer options → Wireless debugging → Pair device with
       pairing code). **The port rotates every time debugging restarts** — rediscover via `mdns`,
       don't reuse the old one.
     - *USB:* just plug in (`adb` = `%USERPROFILE%\platform-tools\adb.exe`).
  2. Open the tunnels — re-run after every reconnect or unplug. With more than one device attached,
     target it explicitly with `-s <dev>`:
     `adb -s <dev> reverse tcp:8081 tcp:8081` && `adb -s <dev> reverse tcp:4000 tcp:4000`
  3. Start the API: `pnpm --filter @pulse/api dev` (port 4000).
  4. `$env:REACT_NATIVE_PACKAGER_HOSTNAME="localhost"; pnpm --filter mobile start -c`
     (expo-dev-client makes this a dev-client server, not Expo Go).
  5. Launch on the device: `adb -s <dev> shell am start -a android.intent.action.VIEW -d
     "pulse://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`. Metro **and** the API
     ride the same tunnels, so `src/lib/trpc.ts` resolves the API to `localhost:4000` and writes
     persist. (The `pulse://` scheme is the app's build-time identity — see Naming below.)
  - Screenshots: `adb exec-out screencap -p > file.png`.
- **Rebuilding the native app — two routes, and the free one is usually right.**
  A rebuild is needed only when a **native** dependency or `app.json` config changes; pure-JS
  changes hot-reload over Metro.
  - **Free CI (no Expo account):** GitHub → Actions → **Android APK** → Run workflow, and pick a
    `variant`:
    - `debug` — a **development client**. It contains no JS bundle; it loads from Metro over the
      `adb reverse` tunnels, so once installed **every JS change hot-reloads with no further
      native build**. This is the one to keep on the S23 while building.
    - `release` — a standalone APK for testers, JS baked in, pointed at the `preview` profile's
      API URL.
    Download `biosync-apk-<variant>` from the run's Artifacts, then `adb install -r`. Each run
    generates a fresh debug keystore, so signatures differ between builds — **uninstall the
    previous BIOSYNC first**, every time.
  - **EAS (needs `eas login`):** `cd apps/mobile && npx eas-cli build --platform android --profile
    development` (project `@kaze7777/pulse`; keystore already on EAS), then `adb install -r <apk>`.
- **`apps/mobile/eas.json` must stay strict JSON — no comments.** EAS CLI tolerates them; the
  Android APK workflow reads the file with Node's `require()`, which does not. A comment there
  fails the build at the first step.
- **The `development` profile deliberately omits `EXPO_PUBLIC_API_URL`.** `src/lib/trpc.ts` lets an
  explicit URL win *in every mode*, so baking the Render URL into a dev build would permanently
  point the dev client away from the local API on `localhost:4000` — silently breaking the loop
  above, where Metro and the API ride the same tunnels. Supabase URL and anon key are present
  because `src/lib/supabase.ts` throws at module scope without them. (The `debug` CI variant needs
  no env at all: `EXPO_PUBLIC_*` values are inlined by Metro at bundle time from
  `apps/mobile/.env` on this machine, and a debug APK carries no bundle.)
- **Stop the API server before `pnpm install`, `prisma generate`, or `prisma migrate`** — a running
  API locks the Prisma query-engine DLL and the install dies with `EPERM`. If it must stay up, use
  `pnpm install --ignore-scripts`.
- Inbound firewall rules for 8081/4000 already exist (network profile is Public).

## Mobile (`apps/mobile`)

- **Stack:** Expo Router · React Native 0.81 · Reanimated 4 · expo-linear-gradient ·
  react-native-svg · expo-haptics · react-native-safe-area-context · @supabase/supabase-js.
- **Design tokens live in `src/ui/theme.ts`** and are the single source of truth for color,
  gradient, spacing, radii, type scale, motion timings, and haptics. Never hard-code a hex,
  duration, or spacing value in a component — import it from `theme`.
- **Design handoffs** (Claude Design bundles) are recreated **pixel-perfectly**. When a design value
  isn't on the existing scale, **add a named token to `theme.ts`** — follow the component-token
  convention (`size.emojiCell`, `size.sheetTopInset`). Never inline the number, never round it away.
- **Design translation rules** (this is a native app, not a web port):
  - No `backdrop-filter`/blur. Depth = elevated surface `surface` on `bg` + 1px `hairline`
    borders. No shadows.
  - No hover. Interactive press = `scale 0.97` (≈120ms) + light haptic; release with a spring.
  - Radial gradients → `react-native-svg` `<RadialGradient>` (expo-linear-gradient is linear
    only). Linear gradients (CTAs, underlines, strength bar) → `expo-linear-gradient`.
  - Animations run on the UI thread via Reanimated worklets, 150–300ms, `Easing.out(Easing.cubic)`
    unless the token says otherwise.
- **Structure:** routing files in `app/` stay thin and delegate to feature bodies in
  `src/features/*`; reusable primitives in `src/ui/*`; clients/singletons in `src/lib/*`.
- **Safe area & keyboard:** wrap in `SafeAreaProvider`; use `useSafeAreaInsets()`. Forms use
  `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"`. `StatusBar style="light"`.
- **Auth/session:** Supabase client in `src/lib/supabase.ts` with an AsyncStorage adapter,
  `persistSession` + `autoRefreshToken`. Session gates routing in `app/_layout.tsx`.
- **Mobile does not import `@pulse/shared` at all — not even for types.** Shared is raw TS with no
  build step, and mobile's `tsconfig` has no path to it: `import type { … } from "@pulse/shared"`
  fails `tsc` with *"Cannot find module"*, and a **value** import additionally fails at runtime
  under Metro. No file in `apps/mobile` imports it; don't be the first.

  Get types from the **tRPC router** instead — the client already has that surface, and it's
  generated from the same Zod schemas, so it can't drift:

  ```ts
  export type ConsentList = Awaited<ReturnType<typeof trpc.consent.list.query>>;
  export type ConsentRow = ConsentList["consents"][number];
  export type ConsentAudience = ConsentRow["audience"];
  ```

  Need the *logic* on both sides? Duplicate the few lines into `src/lib/*.ts` (`format.ts`,
  `photoFormat.ts`, `reminderSchedule.ts` all do this) and cover them with a mobile test, noting in
  the header which shared module they mirror. That's the established pattern, not a workaround to
  clean up.
- **Never render an empty state for a failed request.** "No data yet" and "we couldn't reach the
  server" are different claims, and showing the first for the second quietly lies to the user about
  their own records. On a query error render `ui/bio/LoadFailed`, classifying with
  `lib/netError.ts` `classifyNetError()` so the copy says *offline* vs *server error* honestly.
- **Env:** only `EXPO_PUBLIC_*` vars reach the client. Never import a server secret into mobile.

## API (`apps/api`)

- **Stack:** `@trpc/server` v11 (standalone HTTP adapter) · Prisma v6 · `jose` (JWT) · Zod ·
  Vitest.
- **Auth model:** the mobile app authenticates with Supabase; the API is stateless. Every
  request carries `Authorization: Bearer <supabase-access-token>`. `createContext` verifies the
  JWT — HS256 via `SUPABASE_JWT_SECRET`, or ES256/RS256 against the project JWKS, branching on the
  token's `alg` (see `src/auth.ts`) — reads `sub`, and loads the `User` (with `role`) via Prisma.
  Invalid/absent token → `ctx.user = null`.
- **Authorization:** `protectedProcedure` throws `UNAUTHORIZED` when unauthenticated;
  `requireRole(role)` / `adminProcedure` throw `FORBIDDEN` on role mismatch. Put authz in
  middleware, not resolvers.
- **Staff capability is NOT a role.** `User.role` is only ever `USER` or `ADMIN` in practice — a
  properly granted trainer keeps `role = USER`. Staff access lives in `StaffProfile` (`kind` ×
  `status`) and is gated by `staffProcedure`, which checks `ctx.user.staff`. Gating a staff feature
  on `role` once shipped a bug where **every trainer had a permanently empty roster**.
  - The `Role` enum still contains `PT`/`PRACTITIONER`, and `invites.ts` still writes them, purely
    because the legacy `role` column is `NOT NULL` and part of the staff link's unique key until a
    drop migration lands. **Reads must use `kind`.** Never revive role-based staff checks.
  - `staffProcedure` only opens the surface. Every client read additionally needs an **ACTIVE
    `StaffLink`** (`lib/staffLink.ts`) **and** the client's **consent**, capped by `ROLE_CEILING`
    in `packages/shared/src/staffAccess.ts` — a PT is limited to `ACTIVITY`/`PHOTOS` and can never
    see health records. Accepting an invitation creates the link but grants **no** consent; that
    separation is deliberate.
  - ADMIN is deliberately not staff: running the platform ≠ being someone's care provider.
- **Data:** `User` mirrors Supabase `auth.users` by `id` (uuid). A `handle_new_user` Postgres
  trigger seeds `public.users` on signup with the default `USER` role — it hard-codes `'USER'`, and
  **signup must never grant staff capability**. Roles are a Prisma enum.
  Schema changes always ship a migration, never `db push` on shared DBs.
- **Migrations — `prisma migrate dev` does not work here.** It fails `P3006`: the shadow database
  can't replay `0001_init`, because that migration's `handle_new_user` trigger references Supabase's
  `auth` schema, which no shadow DB has.

  **Run every Prisma command from `apps/api`** (or scoped with `pnpm --filter @pulse/api exec`).
  The schema paths below are relative, and the only schema in this repo is
  `apps/api/prisma/schema.prisma`. Running the diff from the repo root would resolve
  `prisma/schema.prisma` to a file that doesn't exist there — or, if one is ever scaffolded again,
  to an **empty** datamodel, generating a migration that drops every table. A stray root
  `prisma/schema.prisma` + `prisma.config.ts` were committed by accident once (`afeea7c`) and
  removed for exactly this reason; don't let `prisma init` recreate them at the root.

  **A bare `Error: Schema engine error:` with no detail means the URLs are swapped.**
  `DATABASE_URL` is the *pooled* connection (port **6543**, `?pgbouncer=true`) and `DIRECT_URL` is
  the *session* one (port **5432**, no params). Reversed, the app still runs and plain queries
  still succeed — only `prisma migrate` fails, because transaction-mode pooling can't hold the
  advisory locks a migration needs. Check the ports before debugging anything else. (Found
  reversed on 2026-09-01; `.env.example` has the correct mapping.)

  With the API server stopped, from `apps/api`:
  1. Edit `prisma/schema.prisma`, then `pnpm exec prisma migrate status` to confirm the live DB has
     no drift.
  2. Generate the SQL by diffing the **live** DB (no shadow DB involved):
     `mkdir -p prisma/migrations/<NNNN>_<name> && pnpm exec prisma migrate diff
     --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
     --script > prisma/migrations/<NNNN>_<name>/migration.sql`
  3. **Read the SQL before applying it.** It must be additive — any `DROP`/`TRUNCATE` means the diff
     misread the live schema; stop and investigate rather than run it.
  4. `pnpm exec prisma migrate deploy` (applies without a shadow DB), then `pnpm exec prisma generate`.
- **Optional credentials must be loud, inspectable, and never fatal.** Photo upload shipped broken
  and stayed broken for weeks: `SUPABASE_SERVICE_ROLE_KEY` was declared in `render.yaml` with
  `sync: false`, never filled in on the dashboard, and the only symptom was an opaque error when a
  user tapped "add photo". Three things now prevent that shape of bug:
  - `featureConfig()` in `src/env.ts` reports which optional subsystems this deploy can serve
    (`photoStorage`, `aiCoach`, `accountErasure`). Add a feature here when it gains a credential.
  - `reportFeatureConfig()` prints the **user-visible consequence** at boot — "progress photos will
    fail to upload", not "SUPABASE_SERVICE_ROLE_KEY is unset", because the second sentence means
    nothing to whoever reads a deploy log.
  - **`GET /health/config`** returns those booleans, unauthenticated. It exists so the running
    service can be asked what it is configured for **without dashboard access** — that was the gap
    that made this take weeks. Booleans only; never a value, never which of two variables was
    missing beyond the feature it powers.

  These are deliberately **not** added to `assertServerEnv()`. An API that refuses to boot because
  photos aren't configured is a worse outage than the one it prevents — check-ins, nutrition and
  the coach should keep working.
- **A permanent failure must not be dressed as a transient one.** `photos.createUploadUrl` checks
  `storageConfigured()` first and throws `PRECONDITION_FAILED` ("isn't switched on yet"), never
  `INTERNAL_SERVER_ERROR`; the mobile gallery maps that to an `off` tile with **no Retry button**,
  because a Retry that can only fail is worse than no button. Same distinction `hasGroqKey()` draws
  for the coach. When adding a feature behind a credential, follow this: unconfigured → the user is
  told it is off; broken → the user is invited to retry.
- **Type sharing:** the API exports its `AppRouter` type; the mobile client imports it type-only
  for end-to-end type safety. No runtime dependency from mobile on API code.

## §7 Treatments — the one module where a bug is a regulatory problem

IV therapy (§7) is the only surface here where getting it wrong stops being a bad screen and
becomes a regulated-medicine matter. In the UK a prescription-only medicine may not be advertised
to the public (Human Medicines Regulations 2012, reg. 279), and a health claim must be authorised
and substantiated (ASA/CAP). Four rules make that **structural rather than a matter of copy**, and
all four live in `packages/shared/src/treatments.ts`:

- **The catalogue is code, not data.** `TREATMENT_PROTOCOLS` is a constant reviewed in pull
  requests — deliberately not a table an admin screen can edit, and deliberately **never**
  model-generated. Nothing in it names a substance, a dose, or a route; every entry is a
  *consultation category* ("Energy review"), never a product. Adding one is a regulatory change:
  the catalogue guard in `packages/shared/src/__tests__/treatments.test.ts` fails the build on a
  product word or a claim word.
- **The "why" is computed, never generated.** `suggestTreatments` is a pure function of the user's
  own readings, exactly like `nutritionRead` — it restates ("you logged low energy on 3 of the last
  7 days") and never predicts. There is no LLM anywhere in this path, and `SIGNAL_THRESHOLDS` keeps
  "what counts as low" in reviewed, tested code rather than in a query.
- **Approval is an act.** The transition table is data, and nothing reaches `APPROVED` except a
  PRACTITIONER deciding. Silence does not approve, time does not approve, and an approval *expires*
  (`APPROVAL_TTL_DAYS`). `canProceedToBooking` is the only function permitted to say a booking may
  go ahead — never `status === "APPROVED"`, which is also true of a lapsed approval. `effectiveStatus`
  derives expiry on read, so no background job can fall behind.
- **A PT can never review one.** `canReview` refuses PT, and unlike every other staff surface this
  ceiling is **not consent-widenable**: the client is not offered a control that would lower it. A
  trainer is not a clinician.

Two consequences elsewhere. Treatment decisions use `recordAuditTx` — atomic with the status change,
and it **throws** — because `recordAudit`'s own header says best-effort auditing is the wrong
trade-off once the trail is the record of a regulated claim. And `apps/mobile/src/lib/treatmentCopy.ts`
mirrors the disclaimer (mobile cannot import shared); the shared test reads that file off disk and
fails if the two drift, because a drifted disclaimer is a compliance defect, not a typo.

**Booking is a hand-off, and only after approval.** BIOSYNC never takes a booking. An
APPROVED request can open the clinic's own site via `EXPO_PUBLIC_CLINIC_BOOKING_URL`, gated on
`canBook` so it is unreachable before a practitioner has decided — the design's flow (client
picks a slot, practitioner approves it) was deliberately **not** built, because it puts the app
in the position of taking a treatment booking from the public before any clinical review. With
the variable unset the button is absent and the card says the practitioner will arrange it.

**`pnpm test` is DB-free and must stay that way.** Every API test mocks `../db`; the suite is
verified to pass with an unreachable `DATABASE_URL`, so CI and offline work never depend on
Supabase. The one real-database test is opt-in and excluded by default:

```
cd apps/api && RUN_DB_TESTS=1 pnpm exec vitest run src/__tests__/treatments.db.test.ts
```

It drives the whole §7 loop against the live database — request, queue, approve, decline,
withdraw — because a mocked Prisma can prove a query's *shape* but not that the decide
transaction and its audit row actually commit together. It namespaces every row to a per-run
uuid and deletes them (including audit rows, which have no FK and do not cascade). Raise its
timeouts, not vitest's global ones: those numbers are about the pooler, not about slow code.

Note the deviation from `BIOSYNC_FEATURE_DESIGN_PROMPTS.md`, which describes §7 as "AI-surfaced".
It is not, and must not become so: an LLM that invents a protocol name is one token away from
naming a prescription-only medicine to the public.

## Conventions

- TypeScript everywhere, `strict` + `noUncheckedIndexedAccess` (see `tsconfig.base.json`). Each
  workspace extends the base config.
- Validate all external input with Zod at the tRPC boundary. Resolvers stay thin; `userId` always
  comes from `ctx.user`, never from client input.
- **Every change must pass `pnpm typecheck` and `pnpm test` before it's considered done.**
- Secrets only in `.env` (git-ignored); keep `.env.example` in sync when adding a variable.
- Commit only when explicitly asked.
- **Work ships in day-slices** per `PULSE_3WEEK_DEPLOY_PLAN.md`: schema + migration → tRPC
  procedures (authed, Zod) → mobile screen on design tokens → tests. **Build → verify on the device
  → then commit + tag.** One slice per session; out-of-scope ideas go to `LATER.md`.
- No health values in any log statement.