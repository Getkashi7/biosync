# BIOSYNC — design prompts still outstanding

Nine screens in three groups. Everything else is already drawn.

## Already designed — do NOT regenerate these

Your Claude Design project already holds these; they need **implementing**, not designing:

| In the project | Status |
|---|---|
| `fitness/a1-classes` · `a2-checkin` · `a3-coaches` · `a4-history` · `a5-coach-classes` | drawn, not built |
| `fitness/a6-coach-profile` | drawn, **built** |
| `practitioner/9c-photos-*` (6 states) · `9d-photo-viewer` · `9e-photo-compare` · `9f-access-record` | drawn, not built |
| `consent/` · `invites/` · `nutrition/` · `photos/` · `supplements/` · `trainer/` | drawn |

## How to use

Paste **§0** first, then **one brief**. Ask for a `NAME.dc.html` bundle, one file per state.

Do **N1** and **N2** first and stop. They set the register and the density for everything under
them — if the result is not what you want, you have spent two generations finding out instead of
nine.

---

## §0 — System header  *(paste before EVERY brief)*

```
You're designing for BIOSYNC, a dark health app, in its RESTRAINED register — the one used for
staff, admin and settings surfaces. Do NOT use the app's glassmorphism / aurora-bloom / bento style
here. This is the plainest part of the product and it should look it.

CANVAS   Near-black #07070C. One soft radial bloom of the screen's accent, top-left, 8% alpha,
         static, fading to transparent at 70%. Nothing else in the background.
DEPTH    No shadows. No blur. No backdrop-filter. No card containers. Depth comes from a 1px
         hairline rgba(255,255,255,0.09) between rows, and from space. Inputs get a filled box
         (rgba(255,255,255,.05), 1px rgba(255,255,255,.08), 16px radius); nothing else does.
COLOR    ONE accent per screen. Text is white at 100 / 70 / 55 / 45 / 35 / 30% — that ramp carries
         almost all the hierarchy. Coral #FF7A6E for destructive and for "this was cancelled", and
         nothing else. Accents: teal #5ED4C0 (training) · blue #6CA8FF (admin, platform) ·
         violet #A78BFA (the person's own data and privacy).
TYPE     Onest. 10px uppercase letter-spaced section labels at 38%. Row labels 16–17px semibold —
         heavier and larger than a typical settings row, because there are far fewer of them.
         Secondary values 13–14px at 45%. One number per screen may be large.
MOTION   Press scales to 0.97, ~120ms. Nothing else animates.
FRAMES   390×844. Full-bleed. A bare back chevron + 17px title + small uppercase section label on
         one row at the top of every pushed screen.

BOLD, MINIMAL, USER-FRIENDLY — made measurable, so the result can be checked rather than argued:
- TWO TAPS MAXIMUM to reach anything from a tab. If a layout needs three, it is wrong.
- FITS ONE SCREEN. No scrolling on any settings or hub screen. If it scrolls, it has too much in
  it — cut rows, do not shrink type.
- FEWER, BIGGER ROWS. Target 56–64pt rows and 8 or fewer per screen. Weight comes from type size
  and whitespace, never from adding chrome.
- EVERY TAP TARGET ≥ 48pt.

RESTRAINT — the part that matters most. The last handoff had to be half-rebuilt because it was
fuller than the product:
- Put NOTHING on the screen the brief does not list. No invented stats, streaks, percentages,
  progress rings, badges, avatars or "insights".
- No explanatory copy. No taglines, no onboarding hints, no tooltips, no reassurance lines. Use the
  exact strings the brief gives and no others.
- No icons except where the brief names one. Never an icon on every row.
- No illustration, no 3D, no stock photography, no gradient-mesh background.
- Sentence case. No exclamation marks. No emoji.
- Draw every state the brief lists, including the ugly ones. Never fill an empty state with a
  placeholder chart.
- If in doubt, remove it.
```

---

# Group 1 — Navigation  *(do these first)*

The current You tab is 7 section headers and 15 rows, and the things people open daily are buried
inside it. This group is the fix.

## §N1 — Bottom bar  *(accent: teal)*
Four tabs around a raised centre FAB: **Home · Train · [FAB] · Ask · You**.

- Only one thing changes from today: the second slot becomes **Train** with a new glyph. Home, the
  FAB, Ask and You keep their positions and geometry.
- Draw the bar alone at 390 wide, on the canvas, in two states: **Train active** and **You active**.
- Glyphs are 20×20, 1.9px stroke, flat — white at 100% when active, 40% when not. No gradient fill,
  no pill behind the active tab, no dot indicator. The label sits under the glyph, 10–11px.
- The FAB is a raised circle in the centre gap, violet→teal gradient, a `+` knocked out.
- Propose a **Train** glyph: it should read as training, not as a calendar or a chart, and sit
  beside a house, a sparkle and a person without looking busier than any of them.

Also draw: the bar with a **4th tab active and the keyboard up** — it is hidden entirely in that
case, so show the screen bottom without it, to confirm nothing else shifts.

## §N2 — You  *(accent: violet)*
The whole point of this brief is what is **removed**. Seven sections become three, fifteen rows
become eight, and it must fit one screen with no scroll.

- **Identity, compressed to one row.** Today it is an 84pt breathing avatar + name + email + two
  stat pills — about 40% of the screen spent telling people their own name. One row: a small
  initials circle, name, email underneath at 45%. No pills, no glow. (The streak and readiness
  numbers move to Home, where numbers are the point.)
- **HEALTH** — `Treatments` · `Progress photos` · `My care team`
- **SETTINGS** — `Preferences` · `Who sees what`
- **ACCOUNT** — `Download your data` · `Sign out` · `Delete account` (coral label, no chevron)
- **One conditional row above ACCOUNT**, only for staff or admin accounts: `Switch to…` with the
  destination named on the right. It replaces two whole sections that exist today.

Rows are flat on the canvas with a hairline between, no card. Label left, optional short value at
45% right, chevron at 30%.

**Five rows that are on this screen today and must NOT appear.** They are leaving, and a design
that helpfully keeps them defeats the point:

- `Training` and `Gym` — the Train tab reaches both now.
- `Coach plan` — a today-action, so it belongs on Home, not in a settings list.
- `Journal` — parked here only because the timeline lost its tab slot to Train. It moves to Home.
  Eight rows already fills the screen; a ninth makes it scroll, and the no-scroll rule is what
  forces the cut.
- `Privacy policy` — folded inside **Who sees what**.

States: **member** · **member + staff/admin** (the extra row) · and one frame showing the whole
screen at 390×844 with the tab bar, proving no scroll.

## §N3 — Train  *(accent: teal)*
The new tab, and the only genuinely new screen in this document. It is a tab root, so **no back
chevron**.

- Title `Train`, and today's date small beneath it.
- **This week** — a seven-day strip, today marked, each day showing whether a session is planned
  and whether it is done. Tapping a day opens it.
- **Today's session** — its name, its exercises as a short checklist. If there is no plan yet, one
  line saying so and a single action to set a goal.
- **Classes today** — at most three class rows: time, name, venue, and a `Book` or `Booked` on the
  right. Then one row: `All classes ›`.
- Three small flat tiles at the bottom: **Check in** · **Coaches** · **History**.

States: populated · no plan yet · no classes today · loading · failed.

**No new data.** This composes two screens that already exist and are already fed. Do not invent a
weekly-completion ring, a streak, an "intensity" score or a summary card — nothing returns those,
and drawing one turns a layout change into an API change.

---

# Group 2 — Admin  *(accent: blue #6CA8FF — five screens, no designs exist)*

Platform administration. Blue, not teal: an admin is explicitly **not** on anyone's care team, and
the colour is what keeps that legible.

## §B1 — Admin home
Extend the screen that exists — it has a 4-stat row and an exact-email lookup.

- Add one section `PLATFORM` above the lookup: four flat rows with chevrons — **Audit log**
  ("Who did what, when") · **Members** ("Recent joins, and search") · **Trends** ("Sign-ups,
  bookings, visits") · **Venues** ("Places classes happen").
- Draw the whole screen so the new section can be judged in place.

## §B2 — Audit log
Dense, readable, unglamorous. A compliance record, not a feed.

- Chip row: All · Capabilities · Client access · Approvals · Declines · Deletions · Trail reads.
- Flat rows. Action in plain words left ("Changed a capability"); timestamp right at 35%,
  **always a date and a time** (`16 Sep 14:02`) — never "2 hours ago", because two entries four
  minutes apart must not look simultaneous.
- Under it `Ann Coach → Jo Client` at 50%; optional metadata at 33% (`kind: PT · status: VERIFIED`).
- End of list: an outlined **Older** pill, or "That's the whole trail." at 30%.
- **One row must read `deleted account (a1b2…)` as the actor.** That is a real state and it must not
  look like a bug.

States: populated (≥8 mixed rows) · empty · failed.

## §B3 — Members
- Two pill tabs: **Recent** · **Search**.
- Recent: a 38% line — "The newest 25 accounts. There's no way to page further back — that's
  deliberate." — then rows.
- Search: filled input + **Find** pill; the hint becomes "At least 3 characters." when too short.
- Row: initials circle, name, then `ann@example.com · Mon · Sep 14` at 42%. Right: up to two tiny
  pills — `ADMIN` (blue) and/or `TRAINER` / `PRACT` (grey).

States: recent · results · too short (button dimmed) · no matches · failed.

## §B4 — Trends
The restraint clause matters most here.

- Three pill tabs: 7d · 30d · 90d.
- **Revenue card, four states, draw all four:**
  1. large `1,240.00` with `GBP MRR` beside it; `12 paying · 3 trialing · 47 booked` at 45%; a 30%
     line "No history — Stripe reports today, not August."; a small amber `TEST MODE` pill when in
     test mode
  2. "Payments aren't switched on" + one line, **and no button**
  3. "Couldn't reach Stripe" + a **Try again** pill
  4. loading
- Four stacked series. Each: 10px uppercase label left, total right at 18px, then thin vertical
  bars — one per day, 48pt tall, 2px gaps, zero-days as a 1px grey stub. No axes, no gridlines, no
  legend, no tooltips.
- An amber line above the series when capped: "Some series hit the row limit, so the totals below
  under-count."

**There is deliberately no revenue sparkline.** Stripe cannot tell us what MRR was in August, so a
line would be invented. Do not add one.

## §B5 — Venues
- An outlined **Add a venue** pill; the form replaces it in place: NAME · ADDRESS · TIME ZONE, a
  33% hint, an **Active** switch row, then Cancel + **Save**.
- Venue card: name, `Europe/London · 14 Bell St` at 45%, `12 classes · 340 visits` at 33%. A grey
  `RETIRED` pill and 60% opacity when inactive. Two small outlined pills: **Edit** · **Rotate key**.
- Rotate confirmation, in place: "Rotate this venue's key?" + two lines + **Rotate** and **Keep it**.

States: list · form · rotate confirmation · empty · failed.

**The check-in secret is never displayed anywhere.** No field for it, no reveal toggle, no QR
preview.

---

# Group 3 — Account  *(accent: violet)*

## §C1 — Your data
The counterpart to Delete account, reached from You → Download your data.

- Lede: "Everything BIOSYNC holds for your account, as one JSON file you can keep or take
  elsewhere."
- **Before**: one full-width violet **Prepare my data** pill and a 32% centred line — "Nothing
  leaves your phone until you choose to copy or share it."
- **After**: a `WHAT'S IN IT` label, then flat rows — category left at 70%, count right in
  semibold. Thirteen rows (Daily check-ins, Metric readings, Readiness scores, Meals, Supplements,
  Supplement doses, Goals, Sharing settings, Progress photos, Reminders, Care connections, Training
  plans, Session notes). **A zero renders at 30%, never hidden** — a zero is information, an
  omitted row reads as though the export forgot.
- Three small 38% lines beneath (the export's own notes, one about photo links expiring).
- Then: violet **Copy to clipboard** · outlined **Share…** · outlined **Refresh (new photo links)**.

States: before · loading · after · failed.

This one is allowed to scroll — thirteen rows will not fit, and cutting them would mean hiding
categories of someone's own data.

---

## Not in this document, and why

- **QR check-in display** — the scanner needs a native camera module and a new build. Design it in
  the batch that carries push-notification permissions, not before.
- **Coach photos** — not served yet; a card built around one would be rebuilt.
- **Waitlist on a full class** — deliberately not built. There is no push, so nobody would learn
  they got a seat. Do not design one into the class screens.
