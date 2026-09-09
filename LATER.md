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

## From §7 (IV therapy & treatments)

- **Expiry is derived, never written.** `effectiveStatus` shows a lapsed approval as EXPIRED on
  read, so the UI is right the instant it lapses and no cron can fall behind. The stored status
  stays APPROVED as the record that a practitioner did approve. The consequence: `EXPIRED` exists
  in the enum and the transition table but is never persisted. If an expiry ever needs to *fire*
  something (notify the client, free an appointment slot), that needs a real job — and it should
  use the `APPROVED → EXPIRED / SYSTEM` transition that is already defined and tested.
- **No appointment nudge yet.** §12 deliberately has no `APPOINTMENT` nudge type because booking
  didn't exist. It still doesn't — BIOSYNC never books; a practitioner arranges it out of band. A
  nudge for "your practitioner approved a review" is the honest version of that toggle, and needs
  real push (a token table + FCM/Expo), not a device-local schedule, since it's event-driven.
- **The client isn't told when a decision lands.** They see it next time they open the screen.
  Same push dependency as above.
- **No practitioner-side history.** `reviewQueue` shows only REQUESTED. A practitioner can't see
  what they previously approved or declined for a client, which they will want for their own
  records — the rows exist (`reviewedById`, `reviewedAt`, `decisionNote`), only the read is missing.
- **Signals are UTC-bucketed.** `ownSignalDays` keys hydration by `recordedAt`'s UTC day while
  check-ins and readiness are already device-local `@db.Date`. At a timezone boundary a late-evening
  drink can land on the next day's bucket. Same class of issue as the `insights.list` weight
  bucketing already noted; fix both together by taking the client's local day.
- **The catalogue has four entries and one trigger each.** A protocol that should surface on a
  *combination* of signals (low energy AND short sleep) can't be expressed. Worth doing only when
  there's a clinical reason to, and it must stay pure and testable — never a model call.
- **`decisionNote` is never editable.** A practitioner who declines with a typo cannot correct it.
  Deliberate for now (the row is a clinical record), but an append-only correction — a second note,
  never an overwrite — would be the right shape if it's ever needed.

## From §7 — building `Practitioner Queue.dc.html` (design 5B)

Five places the design and the data model did not line up. Each was resolved toward what we can
say truthfully; none is a defect in the design, they are just decisions it could not have made.

- **The design's sample cards name products** — "IV — Magnesium + B-complex", "IV — Vitamin C &
  zinc". `TREATMENT_PROTOCOLS` deliberately does not: it holds *consultation categories*, and the
  catalogue guard fails the build on a substance name. Those titles were not adopted. The defensible
  version, if formulation detail is ever wanted, is a **practitioner-only field the client never
  sees** — the queue is professional-facing, so naming a formulation there is record-keeping rather
  than advertising, but the same string must not travel back to the client's request row, which is
  public-facing. That is a schema change (`clinicalDetail` on `TreatmentRequest`, written by the
  practitioner, never returned by `treatments.list`), not a catalogue edit.
- **The card's meta line assumes a booking already exists** — "The Wellness Rooms, Shoreditch ·
  Sat 6 Sep, 10:20". We model no clinic and no slot. What shipped instead is a **post-approval
  hand-off**: an APPROVED request can open `EXPO_PUBLIC_CLINIC_BOOKING_URL`, the clinic's own
  site. The design's order (slot held, then approved) was rejected deliberately — it would have
  the app take a treatment booking from the public before any clinical review. Per-clinic
  routing and a real slot still need the §6/§7 booking model and its own schema; today there is
  one URL for the whole app, and the practitioner card cannot show which clinic or when.
- **"Decided today" is not built.** The design has a section listing earlier decisions
  ("Approved 8:12 · logged"). `reviewQueue` returns only REQUESTED rows, so it could only be
  populated from the current session — and a section headed "today" that silently omits this
  morning's decisions would be worse than no section. The columns exist (`reviewedAt`,
  `reviewedById`, `decisionNote`); this needs the API read noted above under §7.
- **The staff tab bar (Clients · Queue · Messages · Me) is not built.** `MainTabs` has no staff tab
  bar at all — the professional shell is a push stack — so the queue is reached from the roster.
  Note the design's bar uses `backdrop-filter: blur(28px)`, which CLAUDE.md rules out in RN; the
  translation is an elevated surface plus a hairline.
- **Confirm-decline gating differs on purpose.** The design enables Confirm on any non-empty
  reason; the server requires ten characters (`MIN_DECLINE_REASON`). We hold the server's rule and
  say what is still needed, because a Confirm that gets rejected is worse than one that waits.

## From the build unblock

- **There is no crash reporting.** `@sentry/react-native` was removed: it was pinned `~5.25.0`
  against SDK 54's expected `~6.20.0` — five majors behind, on RN 0.81 with the new architecture —
  and it was **inert anyway**, because `Sentry.init` is guarded on `EXPO_PUBLIC_SENTRY_DSN` and no
  build profile sets one. Worse, its `ErrorBoundary` with no `fallback` renders `null`, so an
  unhandled render error was a blank white screen. `src/ui/AppErrorBoundary.tsx` replaces the
  boundary honestly. Doing Sentry properly means: `@sentry/react-native@~6.20.0`, its
  `@sentry/react-native/expo` config plugin in `app.json`, a real Sentry project, the DSN in every
  `eas.json` profile **and** in the workflow's `need` array, and a decision about the Gradle
  source-map upload task (which wants `SENTRY_AUTH_TOKEN` at build time). Worth doing before real
  users, not before the first green Gradle run.
- **The APK workflow has still never run.** Both variants are unverified — first CI runs commonly
  need a fix or two, and this one now has a `variant` input, a conditional env step and a
  capitalised Gradle task that have never executed. Run `debug` first; it is the one on the
  critical path.
- **`versionCode` is pinned to 1.** Fine while the keystore rotates every run (installs already
  require an uninstall), but it must start incrementing the moment a stable upload key lands —
  `eas.json`'s `production.autoIncrement` writes back into `app.json`, which is why the field now
  exists at all.

## Ops / infrastructure
- **Both hosting tiers sleep, and that's a launch blocker, not a bug.** Supabase (free) pauses the
  database after 7 days idle — the symptom is `FATAL: (ENOTFOUND) tenant or user not found`, fixed
  by restoring it in the dashboard; data survives. Render (free) sleeps the API after ~15 min idle
  with a ~1 min cold start. Both are fine for closed testing and unacceptable once real people
  check in every morning. Render is a one-line fix (`plan: starter` in `render.yaml`); Supabase
  needs a paid tier. Decide before the store push.
