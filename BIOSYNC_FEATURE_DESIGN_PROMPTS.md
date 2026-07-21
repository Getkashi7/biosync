# BIOSYNC — Feature Design Prompts

Prompts to hand to **Claude Design** to produce the `*.dc.html` mockups for each platform feature.
Everything stays in the established BIOSYNC visual language (aurora gradient-mesh · glassmorphism ·
bento · Doto/Onest), so the new surfaces drop into the existing app seamlessly.

## How to use
1. Paste **§0 the System Header** first, then **one feature brief** below it, into Claude Design.
2. Ask it for a `NAME.dc.html` bundle (one file per screen + a README), same as the original handoff.
3. Hand the bundle back here and I implement it **one slice at a time**, gate-green, device-verified.
4. Do them in the build order at the bottom — each depends on the ones above it less than on the
   **Foundation** (roles + consent + audit), which is already partly built.

---

## §0 — System Header (paste before EVERY brief)

```
You're designing new surfaces for BIOSYNC, a dark wellness app (tagline "your body, in tune").
Match the existing design system EXACTLY — these screens sit next to the ones already built:

CANVAS: near-black ink (#07070C / #0B0B12). A few "moment" screens (check-in, reminders) invert to
a soft light lavender/rose — use that only for a calm, single-purpose moment, never for data.
DEPTH: no shadows, no hard cards. Depth = frosted GLASS surfaces (a blur layer + a faint white
top-down gradient sheen + a 1px hairline border, ~24px corner radius) floating over AURORA blooms —
big soft radial-gradient light behind the content that breathes slowly.
COLOR: one accent hue per data family — violet #A78BFA, teal #5ED4C0, coral #FF7A6E, amber #F5B85C,
blue #6CA8FF, magenta #E86BC7. Aurora blooms use the same hues at low alpha. Text is white at
descending opacity (100/70/55/40%). Never more than ~2 accent hues per screen.
TYPE: Onest for UI (300–800). Doto (a round dotted LED face, 700/800) for the hero NUMBERS and any
"readout" — big metric values, timers, counts. Uppercase 11px letter-spaced labels for section heads.
NUMBERS: large, clean, Doto. Gauges are dotted rings/arcs (dashed stroke), not solid bars where a
"device readout" feel fits. Sparklines are thin 1.8px strokes. Bento = a 2-column grid of glass tiles
of varying height, one hue each.
MOTION: calm, 150–300ms ease-out; presses scale to 0.97 with a light haptic; aurora breathes ~6s.
FEASIBILITY (native RN): glow = radial gradient, glass = ONE blur layer, no backdrop-filter tricks,
no hover. Linear gradients for CTAs/underlines only.
FRAMES: 390×844 mobile. Every screen full-bleed to the edges, clearing a floating glass tab bar at
the bottom. Show empty / loading / populated states where relevant.
Mood board: Oura × Apple Health × a meditation app — premium, quiet, high-signal, never clinical.
```

---

## §1 — Progress Photos  *(accent: violet)*
A private, secure photo journal of the body over time.
- **Gallery**: a glass grid of dated thumbnails; a floating "＋" to add. Empty state: a dotted-outline
  frame + "Your first photo starts the timeline."
- **Capture / add sheet**: camera or library, a pose-guide silhouette, and a **visibility selector** —
  segmented glass control: `Only me` · `My trainer` · `My practitioner` (default Only me). A small
  "encrypted, stored privately" reassurance line.
- **Compare**: pick two dates → side-by-side (or a drag slider) with the date + a metric delta chip
  (e.g. weight) under each. Doto dates.
- **Photo detail**: full image, date, visibility toggle, delete.

## §2 — AI Chat Assistant + AI Insights  *(accent: teal)*
Replaces the read-only Insights tab with a conversational wellness guide grounded in the user's data.
- **Thread**: user bubbles (solid glass, right) vs assistant bubbles (aurora-tinted glass, left).
  Assistant messages can embed a mini data card (a small readiness orb, a sparkline tile, a metric
  chip row). A persistent **disclaimer chip** pinned near the composer: "Wellness guidance, not medical
  advice."
- **Composer**: glass input + send; a row of **suggested prompts** as pills ("Why is my readiness
  low?", "How did I sleep this week?").
- **Empty / first-run**: a teal aurora hero, a one-line "Ask me about your body" + the suggestion pills.
- **Insight cards** (the assistant proactively surfaces): a glass card with a hue dot, a headline
  number (Doto), a one-sentence read, and per-card **confidence dots** (● ● ● ○).

## §3 — AI Fitness Plans  *(accent: coral)*
Adaptive training driven by readiness + goals.
- **Today**: a hero glass card — session title, duration (Doto), an intensity ring keyed to today's
  readiness, and a "why this today" line ("Readiness 62 — we dialed volume back"). Start CTA.
- **Exercise list**: glass rows — name, sets×reps (Doto), a small target chip; check-off state.
- **Week view**: 7 day-dots on a dotted spine, each tinted by planned load; rest days dimmed.
- **Adjust**: "too hard / just right / too easy" feedback pills that re-shape tomorrow.
- Empty state: "Set a goal and I'll build your week."

## §4 — Nutrition Insights  *(accent: amber)*
Macro/micro pattern analysis + general wellness suggestions (non-diagnostic).
- **Today ring cluster**: three concentric or side-by-side dotted rings — protein / carbs / fat — each
  with a Doto gram value + target. Calories headline.
- **Micros**: a bento of small glass tiles (fiber, iron, omega-3…) with a fill dot and status word.
- **Patterns card**: "You trend low on protein on training days" style insight + a gentle suggestion.
- **Log entry**: a light quick-add sheet (search / recent) — keep it a calm moment.

## §5 — Supplement Protocols  *(accent: magenta)*
Suggested stacks tied to goals + biometrics — **informational only**.
- **Stack list**: glass cards per supplement — name, dose (Doto), timing chips (AM · Pre · PM), and a
  one-line rationale. A prominent "Informational only — not a prescription" banner at top.
- **Timeline strip**: today's doses across a dotted day-spine with take-off checkmarks.
- **Detail**: what/why/how-much, evidence-level dots, and (if practitioner-edited) a "reviewed by your
  practitioner" badge.

## §6 — Fitness & Gym + Offer Pop-ups  *(accent: coral / teal)*
- **Browse PTs**: coach cards — avatar aurora ring, name, specialties chips, a "book" CTA that opens an
  external Stripe Connect link; a "100% goes to your coach" reassurance line.
- **Classes**: a schedule list (glass rows, time in Doto) + **QR / manual check-in** button; a success
  "checked in" moment.
- **Activity timeline**: gym visits + sessions on the dotted spine (reuse the journal spine).
- **Offer pop-up (PT nudge)** — a glass modal sheet: headline "Ready to take training further?", body,
  dual CTAs `Browse PTs` · `Keep self-training`. Calm, dismissible, not pushy.

## §7 — IV Therapy & Treatments  *(accent: blue)*
AI-surfaced wellness protocol suggestions, **practitioner-gated**.
- **Suggestion card**: blue aurora glass — protocol name, a data-derived "why" ("3 low-energy days"),
  and a required disclaimer: "Wellness suggestion only. A practitioner will review your booking."
- **Booking flow**: external clinic link; a clear **"pending practitioner approval"** status state
  (dotted/pulsing) → approved / declined states.
- **Offer pop-up (IV upsell)**: modal, "Low energy? A practitioner can review an IV protocol tailored
  to your data.", dual CTAs `Learn more` · `Book a consultation`, approval-gate note.

## §8 — PT (Trainer) Dashboard  *(accent: teal)* — mobile, staff role
Fitness/activity data only — never health records.
- **Roster**: glass rows — client avatar, name, readiness dot + Doto score, "last check-in 2d", a small
  session-history spark. Search/filter chips.
- **Client detail**: readiness trend, activity timeline, their goals — **scope banner**: "Fitness &
  activity only."
- **Plan builder**: a mobile-friendly stacked builder — pick exercises from a library (glass list),
  set sets×reps, order via drag handles; assign to a client + week.
- **Schedule**: upcoming sessions (Doto times); **Messaging** thread; **Session notes** composer
  (shared with client, optionally practitioner).

## §9 — Practitioner Dashboard  *(accent: violet)* — mobile, staff role
Consented full wellness profiles + informational protocol tools.
- **Client list**: consent-status dot per client; last activity.
- **Wellness profile**: biometrics, symptom journal, diagnostics/uploads — each **consent-gated**
  (locked tiles show "access not granted / request").
- **Protocol tools**: edit **supplement** suggestions; an **IV/treatment approve–decline** queue
  (cards with approve/decline + reason). All outputs carry the wellness disclaimer.
- **Consent panel**: per-category status + "request expanded access". **Audit note**: "every action is
  logged" reassurance. Secure **messaging**.

## §10 — Admin Dashboard  *(accent: blue)* — mobile, staff role
Phone-first (stacked cards, not wide tables).
- **Overview**: KPI bento — members, active PTs, MRR (Doto), bookings — each a glass tile with a spark.
- **Members / PTs**: searchable lists, status chips (subscription, consent), onboard/offboard actions.
- **Revenue**: Stripe summary — MRR, session volume, a simple trend; "opens Stripe" deep link.
- **Bookings oversight**: all PT + treatment bookings, status filters.
- **Offers / flags**: toggles + A/B config for the pop-ups; RBAC role assignment; **audit-log viewer**
  (a filterable timeline of staff actions — timestamp · user · action).

## §11 — Consent & Compliance  *(accent: violet / neutral)*
The trust layer — client-facing.
- **Consent Center**: per-category glass rows (biometrics, journal, diagnostics, photos, activity)
  each with a **who-can-see** control: `No one` · `My trainer` · `My practitioner`. A plain-language
  "what each role sees" explainer.
- **MFA setup**: a calm step flow (authenticator / code), success state.
- **Data & privacy**: export my data, and **delete my account / right-to-erasure** request flow with a
  clear "30-day processing" confirmation. UK data-residency + encryption reassurance line.

## §12 — Notification Settings  *(accent: rose, matches Reminders)*
Mostly functional, light design — extend the existing Reminders moment.
- A grouped glass list of nudge types: check-in, supplement timing, hydration, appointments, goal
  nudges — each a toggle + optional time. Quiet-hours row. Keep the rose "moment" tone.

---

## Recommended build order (each = one slice: schema+migration → tRPC → screen → tests → device)
1. **Foundation** — roles ✅ (done), + **Consent framework** + **Audit logging** (§11 backbone). *Do next.*
2. **Progress Photos** (§1) — Supabase Storage, encrypted, visibility → consent.
3. **AI Chat + Insights** (§2) — Claude API, non-diagnostic.
4. **Notifications** (§12) — extend reminders.
5. **AI Fitness Plans** (§3) + **Nutrition** (§4) + **Supplements** (§5) — the AI trio.
6. **Fitness / PT booking + offers** (§6) — Stripe Connect.
7. **IV Therapy** (§7).
8. **PT** (§8) → **Practitioner** (§9) → **Admin** (§10) dashboards.

## Provisions needed (gather in parallel)
- **Anthropic (Claude) API key** + budget — for §2–§5.
- **Stripe account + Connect** — for §6–§7.
- **Supabase Storage** confirmed (region already **eu-west-2 / London** ✅) — for §1.
- **FCM vs Expo push** decision — for §12 and appointment/booking nudges.
