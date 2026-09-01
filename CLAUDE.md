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
- **Rebuild the dev client only when native deps/config change** (`app.json` plugins, a new native
  module): `cd apps/mobile && npx eas-cli build --platform android --profile development` (EAS project
  `@kaze7777/pulse`; profiles in `eas.json`; keystore already on EAS), then `adb install -r <apk>`.
  Pure-JS changes just hot-reload over Metro — no rebuild.
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
- **`@pulse/shared` is type-only here.** `import type { … }` is fine; a **value** import from it
  fails at runtime — shared is raw TS with no build step, so Metro can't resolve its runtime
  exports the way the API's pipeline can. Need the logic on both sides? Duplicate the few lines
  into `src/lib/format.ts` and cover them with a mobile test. That's the established pattern, not a
  workaround to clean up.
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
- **Type sharing:** the API exports its `AppRouter` type; the mobile client imports it type-only
  for end-to-end type safety. No runtime dependency from mobile on API code.

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