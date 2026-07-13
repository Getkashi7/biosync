# Pulse — Engineering Guide (CLAUDE.md)

Pulse is a health app ("Your body, decoded."). This monorepo holds the mobile client and its
API. This file is the source of truth for stack and conventions — follow it.

## Monorepo

- **pnpm workspaces + Turborepo.** Node ≥ 20, `pnpm@9`. Never use `npm`/`yarn` here.
- Layout:
  - `apps/mobile` — Expo (SDK 54) React Native app, Expo Router, TypeScript.
  - `apps/api` — standalone `@trpc/server` Node HTTP server + Prisma (Supabase Postgres).
  - `packages/*` — shared code (reserved).
- Root scripts run through Turbo: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
  Scope one workspace with `pnpm --filter mobile <script>` / `pnpm --filter @pulse/api <script>`.

## Mobile (`apps/mobile`)

- **Stack:** Expo Router · React Native 0.81 · Reanimated 4 · expo-linear-gradient ·
  react-native-svg · expo-haptics · react-native-safe-area-context · @supabase/supabase-js.
- **Design tokens live in `src/ui/theme.ts`** and are the single source of truth for color,
  gradient, spacing, radii, type scale, motion timings, and haptics. Never hard-code a hex,
  duration, or spacing value in a component — import it from `theme`.
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
- **Env:** only `EXPO_PUBLIC_*` vars reach the client. Never import a server secret into mobile.

## API (`apps/api`)

- **Stack:** `@trpc/server` v11 (standalone HTTP adapter) · Prisma v6 · `jose` (JWT) · Zod ·
  Vitest.
- **Auth model:** the mobile app authenticates with Supabase; the API is stateless. Every
  request carries `Authorization: Bearer <supabase-access-token>`. `createContext` verifies the
  JWT (HS256, `SUPABASE_JWT_SECRET`), reads `sub`, and loads the `User` (with `role`) via Prisma.
  Invalid/absent token → `ctx.user = null`.
- **Authorization:** `protectedProcedure` throws `UNAUTHORIZED` when unauthenticated;
  `requireRole(role)` / `adminProcedure` throw `FORBIDDEN` on role mismatch. Put authz in
  middleware, not resolvers.
- **Data:** `User` mirrors Supabase `auth.users` by `id` (uuid). A `handle_new_user` Postgres
  trigger seeds `public.users` on signup with the default `USER` role. Roles are a Prisma enum.
  Schema changes always ship a migration (`prisma migrate dev`), never `db push` on shared DBs.
- **Type sharing:** the API exports its `AppRouter` type; the mobile client imports it type-only
  for end-to-end type safety. No runtime dependency from mobile on API code.

## Conventions

- TypeScript everywhere, `strict` + `noUncheckedIndexedAccess` (see `tsconfig.base.json`). Each
  workspace extends the base config.
- Validate all external input with Zod at the tRPC boundary.
- **Every change must pass `pnpm typecheck` and `pnpm test` before it's considered done.**
- Secrets only in `.env` (git-ignored); keep `.env.example` in sync when adding a variable.
- Commit only when explicitly asked.
