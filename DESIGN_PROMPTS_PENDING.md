# BIOSYNC — pending design prompts

Thirteen surfaces are built and live on the existing token system. They work; they have not been
designed. When these bundles land I rebuild the layout against them — the API, the shared rules and
the tests are design-independent and will not move.

## How to use

1. Paste **§0** first, then **one brief**, into Claude Design.
2. Ask for a `NAME.dc.html` bundle, one file per state.
3. Hand it back and I implement one screen per slice, gate-green, device-verified.

Order matters only in one place: **§A1 Classes** sets the register every other gym screen follows,
and **§B2 Audit log** sets it for admin. Do one of each first and check you like it before the rest.

---

## §0 — System header  *(paste before EVERY brief)*

```
You're designing for BIOSYNC, a dark health app. These screens sit next to ones already built, in
its RESTRAINED register — the one used for staff and admin surfaces, not the consumer dashboard.
Do not use the app's glassmorphism / aurora-bloom / bento style here.

CANVAS   Near-black #07070C. One soft radial bloom of the screen's accent hue, top-left, very low
         alpha, static. Nothing else in the background.
DEPTH    No shadows. No blur. No backdrop-filter. Depth is a slightly lighter surface (#0D0C15) on
         the canvas plus a 1px hairline border rgba(255,255,255,0.09), 24px radius on cards,
         16px on inputs, pill on buttons.
COLOR    ONE accent hue per screen, named in the brief. Text is white at 100 / 70 / 55 / 45 / 35 /
         30% — that ramp carries almost all the hierarchy. Coral #FF7A6E for destructive and for
         "this was cancelled", and nothing else.
         Accents: teal #5ED4C0 (gym, training) · blue #6CA8FF (admin, platform) ·
         violet #A78BFA (privacy, the person's own data).
TYPE     Onest. 10–11px uppercase letter-spaced section labels at 38% white. 13–15px body.
         17px card titles. One number per screen may be large; the rest are body size.
         No LED/dotted face on these screens.
MOTION   Press scales to 0.97, ~120ms. Nothing else animates.
FRAMES   390×844. Full-bleed. A back chevron + screen title + small uppercase label sits at the top
         of every screen.

RESTRAINT — this is the part that matters most. The last handoff had to be half-rebuilt because it
was fuller than the product:
- Put NOTHING on the screen that the brief does not list. No invented stats, streaks, percentages,
  progress rings, badges, avatars, or "insights".
- No explanatory copy. No taglines, no onboarding hints, no tooltips, no reassurance lines, no
  "Track your X with ease". Use the exact strings the brief gives and no others.
- No icons except where the brief names one. Never an icon on every row.
- No illustration, no 3D, no stock photography, no gradient-mesh background.
- Sentence case. No exclamation marks. No emoji.
- Prefer one column of flat rows over a grid of cards. Cards only where the brief says card.
- Draw every state the brief lists, including the ugly ones. Do not fill an empty state with a
  placeholder chart.
- If in doubt, remove it.
```

---

# A — Gym  *(accent: teal #5ED4C0)*

## §A1 — Classes  *(sets the register for A2–A6)*
The member's class schedule, and taking a seat.

- Header: "Classes" / label "Gym".
- A row of three small flat tiles: **Check in** ("You're here") · **Coaches** ("Find a trainer") ·
  **History** ("Your visits").
- A horizontal chip row of venue names, first chip "All venues", one selected.
- Then day groups. Each group: an uppercase label — `TODAY`, `TOMORROW`, `FRI 18 SEP` — then cards.
- **Class card**: time range top-left (`18:00 – 18:45`, teal). Top-right is ONE of: a `BOOKED` pill,
  an `ATTENDED` pill (grey), `3 left` (amber), or nothing. Then the class name, then
  `Arch 12 · Sam Levy` at 45%. Bottom-right: a filled teal **Book** pill, OR an outlined **Cancel**
  pill if booked, OR plain grey text `Full` / `Under way` / `Finished` where no button belongs.
- A cancelled class: the whole card at 60% opacity, and a coral line `Cancelled — coach is unwell`.

States to draw: populated · empty ("Nothing scheduled" + one line) · loading (a small spinner, no
skeleton cards) · failed to load ("Couldn't load the schedule" + a Try again).

Note for you: "Full" and "Under way" are deliberately different words and a full class shows no
button at all. Please keep both.

## §A2 — Check in
Say you're at a venue. One tap.

- Header "Check in" / "Gym". One line under it: "Where are you?"
- A vertical list of venue rows: name, address at 45%, and the word "Check in" in teal on the right.
  The tapped row swaps that word for a spinner; the others drop to 40% opacity.
- Footnote at the bottom, 35% white: "Recorded as a self check-in. Scanning the code on the wall
  arrives with the next app update."
- **Success screen** (full screen, replaces the list): a tick, then one of three headings —
  "Checked in" / "Already checked in" — a single sentence under it, and a teal **Done** pill.

States: list · success (checked in, no class matched) · success (already checked in) · empty
("No venues yet") · failed.

## §A3 — Coaches
The directory.

- Header "Coaches" / "Gym". A horizontal chip row of specialities, first chip "All".
- **Coach card**: a circle with two initials (teal tint), name, and specialities as
  `Strength · Mobility` at 45%. Then up to four lines of bio at 62%. Then a full-width filled teal
  **Book with Sam** pill, and under it one small 40% line: "You pay your coach directly — BIOSYNC
  takes nothing and handles no payment."
- A coach with no booking link gets no button — just the grey line "No online booking yet — ask at
  the desk."
- A "Show more" outlined pill at the end of the list.

States: populated (show both card variants) · empty · failed.

Note for you: no photos. Coach photos aren't served yet, and a card designed around one would have
to be rebuilt.

## §A4 — Your gym  *(history)*
What you booked, and when you were actually there.

- Header "Your gym" / "History".
- Two labelled sections, `BOOKINGS` then `VISITS`, each a list of flat hairline-separated rows.
- Booking row: class name, then `Tomorrow · 18:00 · Arch 12` at 45%. Right-aligned: `Booked` (grey)
  or `Attended` (teal).
- Visit row: venue name, then `Today · 07:12 · Intervals` at 45%. Right-aligned: `Scanned` or `Self`
  at 35%.
- Empty per section: one grey line each — "You haven't booked a class yet." / "No check-ins in the
  last 30 days."

States: both populated · both empty · failed.

## §A5 — Your classes  *(coach)*
A coach schedules, cancels, and sees who's coming. Lives in the professional shell — flatter and
plainer than the member screens.

- Header "Your classes" / "Coach". An outlined teal **Schedule a class** pill.
- **The form** (replaces the pill when open, inside one card): venue chips · NAME · a DATE and a TIME
  field side by side, each a value on a hairline underline that opens a native picker · MINUTES and
  CAPACITY side by side · one 33% hint line · Cancel + filled **Schedule**.
- **Class card**: time range left, `5/12` right. Name. Venue. Then two small outlined pills:
  **Who's coming** and **Cancel class**.
- **Roster**, expanded in place of those pills: name rows with `Booked` / `Attended` / `Cancelled`
  right-aligned, then a **Hide** pill.
- **Cancel confirmation**, also in place: "Why is it off?", a multiline box placeholder "Everyone who
  booked will see this", then **Keep it** and a coral **Cancel class**.

States: list · form open · roster open · cancel confirmation · empty · failed.

## §A6 — Your coach profile
The coach's directory entry. The listing switch is the point of the screen.

- Header "Your profile" / "Coach". Lede: "This is what members see in the coach directory. Nobody
  sees it until you switch listing on."
- Fields, each a 10px uppercase label over a filled input: NAME · ABOUT YOU (multiline, with a
  `0/400` counter bottom-right and a 35% hint "Keep to what you do. Claiming clinical work is
  refused.") · SPECIALTIES (wrapping chips, up to 4 selected, unselectable ones at 35%) ·
  BOOKING LINK, with a 35% hint about paying the coach directly.
- A full-width filled teal **Save**.
- Below a hairline: a switch row — "List me in the directory" and a small 35% line under it.

States: filled · a server refusal shown as one coral line above the fields ("A coach profile can't
claim clinical work. Please remove: treat, clinical.") · saved (one teal "Saved." line) · loading.

---

# B — Admin  *(accent: blue #6CA8FF)*

## §B1 — Admin home
Extend the screen that exists. It currently has a 4-stat row and an email lookup.

- Add one labelled section `PLATFORM` above the lookup: a single card of four flat rows with a
  chevron each — **Audit log** ("Who did what, when") · **Members** ("Recent joins, and search") ·
  **Trends** ("Sign-ups, bookings, visits") · **Venues** ("Places classes happen").
- Nothing else changes. Draw the whole screen so I can see the new section in place.

## §B2 — Audit log  *(sets the register for B3–B5)*
The trail. Dense, readable, unglamorous.

- Header "Audit log" / "Platform". A horizontal chip row: All · Capabilities · Client access ·
  Approvals · Declines · Deletions · Trail reads.
- Flat hairline-separated rows. Each: the action in plain words left ("Changed a capability"), the
  timestamp right at 35% (`16 Sep 14:02` — always a date and a time, never "2 hours ago"). Under
  it, `Ann Coach → Jo Client` at 50%. Under that, optional metadata at 33%: `kind: PT · status: VERIFIED`.
- End of list: either an outlined **Older** pill or the 30% line "That's the whole trail."
- One row in your mockup should read `deleted account (a1b2…)` as the actor — that's a real state and
  it must not look like a bug.

States: populated (≥8 rows, mixed) · empty · failed.

## §B3 — Members
Browsing people, carefully.

- Header "Members" / "Platform". Two pill tabs: **Recent** · **Search**.
- Recent: a 38% hint "The newest 25 accounts. There's no way to page further back — that's
  deliberate." then rows.
- Search: a filled input + a **Find** pill, and a hint that becomes "At least 3 characters." when
  short.
- **Member row**: initials circle (blue tint), name, then `ann@example.com · Mon · Sep 14` at 42%.
  Right: up to two tiny pills — `ADMIN` (blue) and/or `TRAINER` / `PRACT` (grey).

States: recent populated · search with results · search too short (button dimmed) · no matches ·
failed.

## §B4 — Trends
Four series and one number. The restraint clause matters most here.

- Header "Trends" / "Platform". Three pill tabs: 7d · 30d · 90d.
- **Revenue card** at the top, and it has four states — draw all four:
  1. a large number `1,240.00` with `GBP MRR` small beside it, then `12 paying · 3 trialing ·
     0 paid sessions · 47 booked` at 45%, then a 30% line "No history — Stripe reports today, not
     August.". A small amber `TEST MODE` pill top-right when in test mode.
  2. "Payments aren't switched on" + one line, **and no button**.
  3. "Couldn't reach Stripe" + a **Try again** pill.
  4. loading.
- Then four series, stacked. Each: a 10px uppercase label left (`SIGN-UPS`), the total right at 18px,
  and under it a row of thin vertical bars — one per day, 48px tall, 2px gaps, tinted, with
  zero-days as a 1px grey stub. No axes, no labels, no tooltips, no legend.
- An amber line above the series when the data is capped: "Some series hit the row limit, so the
  totals below under-count."

Note for you: there is deliberately **no revenue sparkline**. Please don't add one — Stripe can't
tell us what MRR was in August, so a line would be invented.

## §B5 — Venues
Places, and their check-in keys.

- Header "Venues" / "Platform". An outlined blue **Add a venue** pill.
- **Form** (in a card): NAME · ADDRESS · TIME ZONE, each a label over a hairline-underlined input,
  then a 33% hint, then an **Active** switch row with a small line under it, then Cancel + **Save**.
- **Venue card**: name, then `Europe/London · 14 Bell St` at 45%, then `12 classes · 340 visits` at
  33%. A `RETIRED` grey pill top-right and the whole card at 60% when inactive. Two small outlined
  pills: **Edit** · **Rotate key**.
- **Rotate confirmation** in place of those pills: "Rotate this venue's key?" + two lines + a
  **Rotate** pill and a **Keep it** pill.

States: list · form open · rotate confirmation · empty · failed.

Note for you: the check-in secret is never displayed anywhere. Please don't design a field, a reveal
toggle, or a QR preview for it.

---

# C — The person's own data  *(accent: violet #A78BFA)*

## §C1 — Your data  *(export)*
The counterpart to Delete account. Sits in Profile → Account.

- Header "Your data" / "Account". Lede: "Everything BIOSYNC holds for your account, as one JSON file
  you can keep or take elsewhere."
- **Before**: one full-width filled violet **Prepare my data** pill, and a 32% centred footnote
  "Nothing leaves your phone until you choose to copy or share it."
- **After**: a `WHAT'S IN IT` label, then one card of flat rows — label left at 70%, count right in
  semibold. Around thirteen rows (Daily check-ins, Metric readings, Readiness scores, Meals,
  Supplements, Supplement doses, Goals, Sharing settings, Progress photos, Reminders, Care
  connections, Training plans, Session notes). A zero renders at 30%, never hidden.
- Under the card, three small 38% bullet lines (the export's own notes, one about photo links
  expiring).
- Then: filled violet **Copy to clipboard** · outlined **Share…** · outlined
  **Refresh (new photo links)**. A centred 32% footnote with the export time and format.

States: before · loading · after · failed.

## §C2 — Progress photos on a client  *(a SECTION, not a screen — accent: teal)*
Add to the trainer's client-detail screen, above `YOUR SESSIONS`. This is the most sensitive thing
a trainer can see, and the design has to feel like it knows that.

Draw the section in four states:
1. **Not shared** — label `PROGRESS PHOTOS`, then one grey line "Not shared with you." Nothing else.
2. **Not yet opened** — an outlined **View photos** pill. (Opening is recorded, so it's behind a tap.)
3. **Open** — a wrapping grid of small portrait thumbnails, ~88×118, 12px radius, each with the
   date `09-10` on a dark strip across the bottom. Under the grid, one 35% line: "They chose to
   share these. Your view is recorded."
4. **Shared but empty** — one grey line: "Shared, but they haven't added any yet."

Note for you: states 1 and 4 say different things and both must exist. Please don't merge them into
one empty state.

---

## Not in this list, and why

- **QR check-in display** — the scanner needs a native camera module and a new build. Design it in
  the same batch as push-notification permission screens, not before.
- **Coach photos** — not served yet; a card built around one would be rebuilt.
- **Waitlist on a full class** — deliberately not built (no push, so nobody would learn they got a
  seat). Please don't design one into §A1.
