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

## From §4 Nutrition (macro targets)
- ~~**Sanity floor on `macroTargets`**~~ — **DONE (2026-07-20).** Targets scale off the most recent
  logged bodyweight (`30 kcal/kg`) and the function used to trust any positive number, so a weight
  entered in lb while the unit toggle said kg (65 lb → 29.5 kg) produced a ~885 kcal daily target
  and the app reported "over target" at a third of a normal adult day (observed on-device).
  `macroTargets` now falls back to `DEFAULT_TARGETS` outside a plausible 35–250 kg range, so a unit
  mix-up can no longer nudge someone to under-eat. Covered by tests.
- **Weight unit entry**: the underlying cause is still reachable — a user can type a lb number into
  a kg field. Worth a unit-aware weight input (or a "that looks like lb, convert?" confirm) in the
  quick-log sheet.

## From the platform buildout
- **Drop the legacy `role` column on staff links.** Staff capability moved to `StaffProfile`
  (`kind` × `status`), but the old `role` column is still `NOT NULL` and part of the link's unique
  key, so `invites.ts` keeps writing it via `kindToRole()` purely to satisfy the constraint. Reads
  already use `kind`. Needs a migration that reworks the unique key off `role`, then drops the
  column and the `PT`/`PRACTITIONER` values from the `Role` enum — while they exist, they're an
  invitation to re-introduce the empty-roster bug by gating on role. Follow the `migrate diff`
  procedure in CLAUDE.md; this one is **not** additive, so read the SQL especially carefully.

## From §12 (Notification settings)
- **Appointment nudges** are deliberately absent from `NudgeType`. The §12 brief lists them, but
  booking (§6/§7) doesn't exist yet, and a toggle that can never fire is worse than no toggle. Add
  the enum value on both sides (`packages/shared/src/notifications.ts` and `schema.prisma`) when
  appointments land — `mergeNudges` backfills existing users, so no data migration is needed.
- **Nudges are device-local only.** Everything fires through `expo-notifications` on the phone;
  the server stores preferences but sends nothing. That's fine for time-of-day reminders, but
  anything event-driven (an appointment moved, a trainer shared a plan) needs real push — a token
  table plus FCM/Expo push. The `FCM vs Expo push` decision in the provisions list is still open.
- **Per-supplement timing**: the SUPPLEMENTS nudge is one daily reminder for the whole stack,
  because `Supplement` has no time field. The §5 schedule slots (morning/evening) could drive
  several, if the single nudge proves too blunt.
- **Quiet hours silence rather than shift.** A nudge inside the window doesn't fire at all; it
  isn't moved to the edge of the window. The settings screen says so, but "remind me after quiet
  hours end" may be the kinder behaviour.

## From §1 (Progress photos)
- **Offline gallery (design 5C) is not built.** The design shows cached photos dimmed plus a
  "waiting for connection" tile, under a banner reading *"Showing photos saved on this phone"*.
  Nothing is cached on the device yet, so that banner over an empty grid would be a lie — in the
  one feature built around not lying. Offline currently renders 5B with offline copy instead
  ("They're safe — you just look offline. Nothing was deleted."), which is true. Doing 5C properly
  needs the photo list in AsyncStorage **and** the images themselves on disk, since a signed URL
  can't load offline: that's a real caching layer, not a banner.
- **Queued uploads don't survive the app closing.** A failed upload keeps its tile with Retry for
  the session, but the pending list is in memory. Persisting the queue (and retrying it on
  reconnect) is what would make the 5C promise "new photos upload automatically when you're back
  online" true.
- **Photos aren't compressed before upload.** The bucket caps at 10 MB and the picker rejects
  anything larger, so a modern phone photo can be refused outright. `expo-image-manipulator`
  (~14.0.7 for SDK 54) would let a photo be resized before it counts against that cap — but it's
  another native module, so it waits for a dev-client rebuild.
- **Staff can't read photos yet.** The API deliberately has no staff-facing photo procedure: it
  needs an active StaffLink AND the PHOTOS consent AND the per-photo override intersection
  (`effectivePhotoAudience`), and belongs with §9 where it can be tested end to end. Until then
  the visibility selector records intent that nothing acts on — the copy is honest about who
  *would* see it, but no staff surface reads photos today.

## Ops / infrastructure
- **Both hosting tiers sleep, and that's a launch blocker, not a bug.** Supabase (free) pauses the
  database after 7 days idle — the symptom is `FATAL: (ENOTFOUND) tenant or user not found`, fixed
  by restoring it in the dashboard; data survives. Render (free) sleeps the API after ~15 min idle
  with a ~1 min cold start. Both are fine for closed testing and unacceptable once real people
  check in every morning. Render is a one-line fix (`plan: starter` in `render.yaml`); Supabase
  needs a paid tier. Decide before the store push.
