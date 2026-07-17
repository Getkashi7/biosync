# LATER — out-of-scope ideas parked during day-slices

## From Day 5 hardening
- **ESLint**: no workspace has a `lint` script, so `pnpm lint` is a no-op. Recipe: mobile →
  `npx expo lint` (installs eslint-config-expo); api + shared → `typescript-eslint` flat config;
  add a `lint` script to each workspace so Turbo picks them up. Worth doing before the store push.
- **Readiness ring count-up** updates React state from an animated reaction (~30 updates/800ms).
  No jank observed on the S23 so far; if it appears, switch the number to an on-UI-thread text
  (Reanimated `useAnimatedProps` on `TextInput` — the ReText pattern) instead of setState.
- **Journal pagination**: the feed loads a fixed 30-day window; long-term users need
  `FlatList.onEndReached` + windowed queries.

- **"+ Log today" FAB** (Pulse Dashboard design): duplicate entry point to the tab bar's Log
  action — decide whether to add it once the dashboard fills out.
- **"Today's plan" workout card** (Pulse Dashboard design): waits on workout/plan features.
- **7-day stat cards with sparklines** (Pulse Dashboard design): Day 4 trends slice.
- **Greeting name from the API** instead of client-side Supabase `user_metadata` (would also
  cover users created before sign-up stored `full_name`).

## From Day 8 (Insights)
- **Readiness snapshot freshness**: a snapshot is written on check-in and backfilled by
  `insights.list`, but a resting-HR reading logged *after* that day's check-in doesn't rewrite
  the day's snapshot — so the trend's "today" value can lag the live dashboard until the next
  check-in. Fix: also (re)write today's snapshot from `metrics.log` when a RESTING_HR reading
  lands (needs the client's device-local `today` on `metricLogInput`), or recompute today's
  snapshot on each `insights.list`.
- **Insights refresh trigger**: the feed only refetches when a logging sheet closes (MainTabs
  `refreshKey`) or on pull-to-refresh. A check-in made on the Home tab won't be reflected until
  one of those — fine for now, revisit if it feels stale.
- **Phase-2 chat**: the "Ask Pulse about your data" teaser is a static, non-pressable SOON pill.
  The real conversational surface (LLM over the user's metrics) is a later slice.
- **Weight-day bucketing** in `insights.list` counts WEIGHT metric readings by UTC day, not the
  device-local day (check-in weights are already local). Only affects the nudge's "N more
  entries" count at tz boundaries; align with the client tz if it ever matters.
