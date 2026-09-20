/**
 * Pulse design tokens — the single source of truth for the whole app.
 *
 * Final palette from the "Pulse Dashboard" spec panel (colors, gradient stops,
 * spacing, radii, type scale, motion timings, haptics). The brand system is the
 * orange → coral → blue gradient shared by the auth flow, dashboard, and the
 * daily check-in. Components must never hard-code a hex, duration, or spacing
 * value — import from here.
 *
 * Translation notes (native, not web):
 *  - Depth = elevated `surface` on `bg` + 1px `hairline` borders. No blur, no shadows.
 *  - Linear gradients (CTA, FAB, slider fill, focus underline, strength bar) →
 *    expo-linear-gradient.
 *  - Radial glow blobs → react-native-svg <RadialGradient> (see `gradient.glow`).
 */
import { Easing } from "react-native-reanimated";

// ── Color ──────────────────────────────────────────────────────────────────────
export const color = {
  /** app background */
  bg: "#0A0A0F",
  /** page/backdrop deep black (behind the device in the design) */
  bgDeep: "#060609",
  /** elevated surface (cards, pills, sheet) */
  surface: "#131318",
  /** alternate elevated surface (spec panel) */
  surfaceAlt: "#101014",
  /** code/inset surface */
  surfaceCode: "#0B0B10",
  /** tab bar + inset controls (emoji cells) */
  inset: "#0E0E13",

  /** 1px hairline border on elevated surfaces */
  hairline: "rgba(255,255,255,0.08)",
  /** ghost-button / stronger border */
  border: "rgba(255,255,255,0.14)",
  /** resting border on inset option cells (emoji buttons) */
  optBorder: "rgba(255,255,255,0.10)",
  /** input underline, resting */
  fieldBorder: "rgba(255,255,255,0.13)",
  /** input underline, focused (non-gradient portion) */
  fieldBorderFocus: "rgba(255,255,255,0.20)",

  /** primary text */
  text: "#F4F4F6",
  /** secondary text */
  textSecondary: "rgba(255,255,255,0.60)",
  /** tertiary / caption text */
  textTertiary: "rgba(255,255,255,0.45)",
  /** section-label / faint text */
  textFaint: "rgba(255,255,255,0.40)",
  /** an unfilled metric value ("—") */
  textPlaceholder: "rgba(255,255,255,0.30)",
  /** the "(optional)" qualifier inside a section label */
  textOptional: "rgba(255,255,255,0.25)",
  /** readiness-ring status label ("Ready to train") */
  textStatus: "rgba(255,255,255,0.55)",
  /** trend-card title ("Sleep · 7d") */
  textStat: "rgba(255,255,255,0.50)",
  /** chip / pill text on surface */
  textStrong: "rgba(255,255,255,0.70)",
  /** low-confidence hint dot halo (orange tint) */
  warnDotBg: "rgba(255,140,66,0.20)",
  /** faintest text — version footer */
  textGhost: "rgba(255,255,255,0.34)",
  /** destructive button fill (error tint) */
  errorBg: "rgba(229,100,95,0.14)",
  /** inactive tab-bar icon stroke */
  iconInactive: "rgba(255,255,255,0.35)",
  /** log-chooser row icon stroke */
  iconStrong: "rgba(255,255,255,0.70)",
  /** resting floating-label text */
  textLabel: "rgba(255,255,255,0.42)",

  /** brand — orange → coral → blue */
  orange: "#FF8C42",
  coral: "#FF5E62",
  blue: "#4A7DFF",
  /** lighter blue — links, "avg"/"rising" accents */
  blue2: "#7EA2FF",

  /** selected emoji cell fill + border (orange tint) */
  emojiSelectedBg: "rgba(255,140,66,0.14)",
  emojiSelectedBorder: "rgba(255,140,66,0.75)",
  /** unfilled energy-dot track */
  dotTrack: "rgba(255,255,255,0.12)",
  /** readiness ring / chart track */
  track: "rgba(255,255,255,0.07)",
  /** sheet scrim */
  scrim: "rgba(0,0,0,0.6)",

  /** error text + focused label on error */
  error: "#E5645F",
  /** error underline/border */
  errorBorder: "rgba(229,100,95,0.70)",

  /** link / accent text */
  link: "#7EA2FF",
  linkHover: "#A9C2FF",

  /** input caret */
  caret: "#4A7DFF",
  /** text on a gradient fill */
  onGradient: "#FFFFFF",

  /** — insights feed — */
  /** card badge tints (metric accent @ ~14%) */
  insightBadgeSleep: "rgba(74,125,255,0.14)",
  insightBadgeWarm: "rgba(255,140,66,0.14)", // resting HR + streak
  insightBadgeCoral: "rgba(255,94,98,0.14)",
  /** readiness badge — neutral, the dot carries the brand gradient */
  insightBadgeNeutral: "rgba(255,255,255,0.06)",
  /** nudge badge + its dot (demoted, never alarming) */
  insightBadgeMuted: "rgba(255,255,255,0.05)",
  insightNudgeDot: "rgba(255,255,255,0.28)",
  /** delta-pill backgrounds (cool = readiness, warm = resting HR) */
  insightDeltaCoolBg: "rgba(74,125,255,0.16)",
  insightDeltaWarmBg: "rgba(255,140,66,0.14)",
  /** empty / error big sparkle glyph */
  insightGlyph: "rgba(255,255,255,0.22)",
  /** disabled chat teaser */
  teaserText: "rgba(255,255,255,0.40)",
  teaserIcon: "rgba(255,255,255,0.30)",
  teaserBadgeText: "rgba(255,255,255,0.35)",
  teaserBadgeBorder: "rgba(255,255,255,0.10)",
} as const;

// ── Gradient ───────────────────────────────────────────────────────────────────
// Brand gradient used by CTA fills, the FAB, slider fill, focus underlines, and
// the strength bar. SVG strokes (ring arc, charts, checkmark) reuse the same stops.
export const gradient = {
  // BIOSYNC redesign: violet → aqua → teal (retargeted so every remaining
  // old-gradient control — sliders, dots, buttons, glow — reads on the new palette).
  brandColors: ["#A78BFA", "#77C6D4", "#5ED4C0"] as const,
  brandLocations: [0, 0.5, 1] as const,

  /** CTA / FAB / slider fill use a slight diagonal */
  ctaStart: { x: 0, y: 0 } as const,
  ctaEnd: { x: 1, y: 0.6 } as const,

  /** underline + strength bar run horizontally */
  lineStart: { x: 0, y: 0.5 } as const,
  lineEnd: { x: 1, y: 0.5 } as const,

  /** logo dot + ring arc use a 135deg diagonal */
  logoStart: { x: 0, y: 0 } as const,
  logoEnd: { x: 1, y: 1 } as const,

  /** trend-card sparkline strokes (horizontal, left → right) */
  chartCool: ["#4A7DFF", "#7EA2FF"] as const,
  chartWarm: ["#FF8C42", "#FF5E62"] as const,

  /**
   * Ambient radial glow blobs (react-native-svg RadialGradient).
   * Animate transform only (drift) — never re-render the gradient.
   * `purple` = the top-left blue blob; `magenta` = the bottom-right orange blob
   * (keys kept for GlowBlobs; colors are the dashboard's blue/orange).
   */
  glow: {
    purple: { color: "rgba(74,125,255,0.26)", mid: "rgba(74,125,255,0.08)", size: 520 },
    magenta: { color: "rgba(255,140,66,0.20)", mid: "rgba(255,94,98,0.07)", size: 480 },
  },
} as const;

// ── Spacing & radii (dp) ─────────────────────────────────────────────────────────
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  strength: 2,
  card: 16,
  cta: 16,
  /** emoji option cell */
  emoji: 14,
  /** small segmented-toggle cell (profile units) */
  segment: 8,
  /** bottom sheet top corners */
  sheet: 28,
  pill: 999,
} as const;

export const size = {
  /** horizontal screen padding */
  screenPadX: 24,
  /** field row height */
  fieldRow: 64,
  /** gap between fields */
  fieldGap: 10,
  /** CTA / ghost / save-check-in button height */
  ctaHeight: 56,
  /** minimum touch target */
  touchTarget: 44,
  /** strength track height */
  strengthTrack: 3,
  /** focus underline thickness */
  underline: 2,
  /** bottom CTA block padding — collapses when keyboard is up */
  formPadBottom: 40,
  formPadBottomKeyboard: 12,
  /** logo dot */
  logoDot: 44,

  /** — check-in / tab bar — */
  /** tab bar content height (add insets.bottom) */
  tabBar: 54,
  /** sheet top gap below the status bar (add insets.top) */
  sheetTopInset: 40,
  /** grabber handle */
  grabberW: 40,
  grabberH: 4,
  /** emoji option cell height */
  emojiCell: 52,
  /** slider track thickness + thumb + touch-row height */
  sliderTrack: 6,
  sliderThumb: 26,
  sliderRow: 44,
  /** energy dot diameter + touch-row height */
  dot: 16,
  dotRow: 44,

  /** — log sheets (chooser / quick log) — */
  /** sheet top padding above the grabber */
  sheetPadTop: 10,
  /** grabber → sheet title */
  sheetTitleGap: 18,
  /** log-chooser option row */
  chooserCard: 72,
  /** chooser row icon → its text */
  chooserIconGap: 14,
  /** gap between quick-log fields */
  metricFieldGap: 20,
  /** metric value cell horizontal padding */
  metricCellPadX: 14,
  /** breathing room between the last field and the Save CTA */
  quickLogSaveGap: 64,
  /** Save CTA → the hairline above the home indicator */
  saveDividerGap: 14,
  /** quick-log success checkmark */
  successCheck: 84,

  /** — dashboard — */
  /** readiness ring box + geometry (r/stroke from the design's 208 viewBox) */
  readinessRing: 208,
  ringRadius: 88,
  ringStroke: 11,
  /** header streak pill height */
  streakPill: 34,
  /** metric chip pill height */
  chip: 30,
  /** colored dot inside a chip */
  chipDot: 6,
  /** dot → text gap inside chips and the streak pill */
  chipGap: 6,
  /** vertical rhythm between dashboard sections (header → ring → cards) */
  dashSectionGap: 18,
  /** ring → chips / under-ring caption gap */
  chipRowGap: 14,
  /** chips → low-confidence hint gap */
  hintGap: 10,
  /** low-confidence hint dot halo + core */
  hintDot: 12,
  hintDotCore: 4,
  /** max width of centered under-ring captions */
  hintMaxW: 280,

  /** — trend cards — */
  /** sparkline drawing area */
  statChartW: 130,
  statChartH: 44,
  /** sparkline stroke width */
  statStroke: 2.5,
  /** card vertical padding (horizontal = space.base) */
  cardPadY: 14,

  /** — journal — */
  /** gap between entries in a day section (and card header → chips) */
  entryGap: 10,
  /** gap between day sections (and header → feed) */
  daySectionGap: 20,
  /** check-in icon in an entry card */
  journalIcon: 20,
  /** value chip height + horizontal padding */
  journalChip: 24,
  journalChipPadX: 10,

  /** — profile — */
  /** identity avatar circle */
  avatar: 56,
  /** settings-card row height */
  settingsRow: 52,
  /** units segmented-toggle cell */
  unitCellW: 40,
  unitCellH: 28,

  /** — insights feed — */
  /** header → first section label */
  insightHeaderGap: 22,
  /** headline → sub-line */
  insightSubGap: 3,
  /** card badge circle + its inner dot */
  insightBadge: 26,
  insightBadgeDot: 8,
  /** emoji glyph inside a badge (streak) */
  insightBadgeEmoji: 13,
  /** badge → text row gap */
  insightBadgeGap: 10,
  /** trailing delta pill */
  insightDeltaChip: 24,
  insightDeltaPadX: 10,
  insightDeltaArrow: 10,
  /** arrow → label gap inside a delta pill */
  insightDeltaGap: 5,
  /** sparkline left indent = badge (26) + row gap (10) */
  insightSparkIndent: 36,
  /** headline block → sparkline gap */
  insightSparkGap: 10,
  /** nudge "Log it" pill (44-tall hit row around a 32 pill) */
  insightNudgePill: 32,
  insightNudgePillPadX: 14,
  /** disabled chat teaser icon + "SOON" badge */
  teaserIcon: 18,
  teaserBadge: 20,
  teaserBadgePadX: 8,
  /** empty / error centered sparkle */
  insightGlyph: 40,
} as const;

// ── Typography ──────────────────────────────────────────────────────────────────
// Font family keys map to the loaded Space Grotesk weights (see useAppFonts()).
export const fontFamily = {
  // BIOSYNC redesign: Onest (UI) + Doto (dotted readouts). Names kept back-compat
  // (regular/medium/semibold/bold) so existing `type.*` tokens keep resolving.
  light: "Onest_300Light",
  regular: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
  extrabold: "Onest_800ExtraBold",
  dot: "Doto_800ExtraBold",
  dotBold: "Doto_700Bold",
} as const;

type TypeToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

export const type = {
  /** wordmark */
  display: { fontFamily: fontFamily.bold, fontSize: 56, lineHeight: 60, letterSpacing: -1.12 },
  title: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
  success: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.34 },
  /** greeting / screen heading */
  greeting: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.22 },
  /** bottom-sheet title */
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  /** big gradient number readout (slider hours) */
  readout: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 30, letterSpacing: -0.26 },
  /** readiness score in the ring (design -0.02em × 58) */
  score: { fontFamily: fontFamily.bold, fontSize: 58, lineHeight: 60, letterSpacing: -1.16 },
  /** streak-pill count */
  chipValue: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 18 },
  /** centered under-ring caption (empty/error states) */
  hint: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  /** trend-card value ("7h 24m") */
  statValue: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 26 },
  /** journal entry title / metric name + value */
  entryTitle: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20 },
  /** profile identity name */
  identityName: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22 },
  /** profile avatar initials */
  avatarInitials: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 24 },
  /** settings-row label / value */
  settingsLabel: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  /** journal value chip */
  journalChip: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 14 },
  /** uppercase section label */
  sectionLabel: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.32 },
  /** log-chooser option title */
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  input: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22 },
  button: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  /** floating label at rest (16px); lifted state scales to ~0.78 via transform */
  label: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 20 },
  caption: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  captionSm: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
  /** insight card headline / sub-line / delta pill */
  insightHeadline: { fontFamily: fontFamily.semibold, fontSize: 15.5, lineHeight: 21 },
  insightSub: { fontFamily: fontFamily.medium, fontSize: 12.5, lineHeight: 17 },
  insightDelta: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16 },
  /** disabled chat teaser label + "SOON" badge */
  teaser: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  teaserBadge: { fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 12, letterSpacing: 0.8 },
} as const satisfies Record<string, TypeToken>;

// ── Motion ──────────────────────────────────────────────────────────────────────
// All animation runs on the UI thread (Reanimated). Default easing = out-cubic.
export const motion = {
  easeOut: Easing.out(Easing.cubic),
  /** matches the design's cubic-bezier(0.22, 1, 0.36, 1) */
  easeEmphasized: Easing.bezier(0.22, 1, 0.36, 1),
  easeLinear: Easing.linear,

  duration: {
    rise: 420, // entrance per element
    stagger: 100, // delay between entrance elements
    screen: 280, // push / pop
    fadeOut: 180, // fade-through out
    fadeIn: 260, // fade-through in
    press: 120, // CTA/FAB press-in scale
    label: 180, // floating label lift
    underline: 200, // focus underline scaleX
    strength: 250, // strength bar width
    errorBorder: 200, // error border color
    shake: 320, // error shake (total)
    spinner: 800, // CTA spinner rotation

    // — dashboard —
    ringFill: 800, // readiness ring sweep + score count-up
    chartDraw: 900, // trend sparkline draw-in (entrance offset comes from RiseIn stagger)

    // — check-in sheet —
    sheetOpen: 300, // translateY 105% → 0 (Easing.out(cubic))
    sheetScrim: 240, // scrim opacity 0 → 0.6
    sheetClose: 260, // close mirror
    sheetTeardown: 340, // unmount after close
    select: 150, // emoji / dot select scale + color
    successOverlay: 260, // success overlay opacity + scale 0.6 → 1
    successCheck: 320, // checkmark pop
    successCheckDelay: 80, // check pops at +80ms
    successTextDelay1: 160, // "Check-in saved" rises at +160ms
    successTextDelay2: 240, // streak line rises at +240ms
    successHold: 1200, // hold before auto-dismiss (~1.2s)
  },

  drift1: 14000, // ambient blob A
  drift2: 18000, // ambient blob B

  /** CTA / FAB press-in target scale */
  pressScale: 0.96,
  /** emoji / dot selected scale */
  selectScale: 1.06,
  /** energy dot selected scale */
  dotSelectScale: 1.15,
  /** spring used on press release + sheet-drag settle */
  pressSpring: { damping: 18, stiffness: 280 },
  /** floating-label lifted transform */
  labelLift: { translateY: -26, scale: 0.78 },
  /** entrance rise offset */
  riseTranslateY: 20,
  /** screen transition offsets */
  screenInX: 64,
  screenOutX: -48,
  /** error shake keyframes (dp) */
  shakeSequence: [-8, 7, -4, 2, 0],
} as const;

// ── Haptics ─────────────────────────────────────────────────────────────────────
// Names map to expo-haptics calls in src/lib/haptics.ts.
export const haptic = {
  press: "light", // Haptics.impactAsync(Light) on CTA/FAB press-in
  success: "success", // Haptics.notificationAsync(Success) on check-in saved
  error: "error", // Haptics.notificationAsync(Error)
  select: "selection", // Haptics.selectionAsync() on slider step / emoji / dot
  toggle: "selection", // Haptics.selectionAsync() on Show/Hide, kg/lb
} as const;

// ── BIOSYNC redesign tokens ──────────────────────────────────────────────────
// New "ambient biofeedback" system: aurora radial fields, glass surfaces, Doto
// dotted readouts. Added additively — the legacy `color/size/type` above stay
// until the last screen is re-skinned onto `bio`, then get removed.
export const bio = {
  color: {
    page: "#07070C",
    ink: "#0B0B12",
    ink2: "#0C0B14",
    inkDeep: "#0A0A10",
    surface: "#0D0C15",
    /** light "moment" screens (check-in, reminders, add-meal) */
    lilac: "#E9E4F6",
    rose: "#EBD7E5",
    /** peach canvas — the Add Meal moment (nutrition) */
    peach: "#F2E4D7",
    /** pale-rose canvas — the Add-to-stack moment (supplements) */
    rosePale: "#EEE0EA",
    onLilac: "#221C33",
    onRose: "#2A1626",
    /** ink on the peach canvas + the light text on its dark CTA */
    onPeach: "#2E2113",
    peachText: "#F7EFE4",
    /** ink on the pale-rose canvas + the light text on its dark CTA */
    onRosePale: "#2C1926",
    rosePaleText: "#F6E9F2",
    /** primary text on dark */
    text: "#F4F2F8",
    /**
     * Pure white — the active tab label and glyph in N1.
     *
     * Its own token rather than `text`: the bar's active state is a full-white
     * against a 40% inactive, and the off-white body colour reads as a third,
     * muddier state between them.
     */
    white: "#FFFFFF",
    /** aurora accents — one hue per metric family */
    violet: "#A78BFA",
    teal: "#5ED4C0",
    coral: "#FF7A6E",
    blue: "#6CA8FF",
    amber: "#F5B85C",
    magenta: "#E86BC7",
    purple: "#7C56FF",
    /** lighter accent variants (glowing text + marks) */
    tealLt: "#A5EBD9",
    blueLt: "#9BC4FF",
    /** practitioner accent on the role explainer */
    blueLt2: "#9FC2FF",
    tealLt2: "#8FE3CF",
    magLt: "#F2A9DF",
    /** — supplements (magenta family) — */
    /** light end of the magenta FAB / chips / evidence dots */
    magentaLt: "#F0A6DD",
    /** deep end of the magenta FAB + segmented fill */
    magentaDeep: "#D65FA8",
    /** deep end of the teal CTA / toggle track (staff surfaces) */
    tealDeep: "#37B4A0",
    /** ink knocked out on a teal fill */
    onTeal: "#062018",
    /** ink on the SOLID teal CTA of the §6 gym screens (A1–A6 handoff) */
    onTealSolid: "#07251E",
    /** ink knocked out on a solid coral fill — the destructive CTA (A5) */
    onCoral: "#210B08",
    /**
     * "3 left" on a nearly-full class (A1).
     *
     * Its own value, not `amber` (#F5B85C): the handoff runs this one a touch
     * deeper so it reads as urgency beside teal rather than as another accent.
     */
    seatsLow: "#E5B15F",
    /** the sliding knob on a filled toggle track */
    knob: "#FFFFFF",
    /** plum the ＋ glyph is knocked out in, on the magenta FAB */
    plum: "#160910",
    /** — consent / trust layer (violet family) — */
    /** deep end of the violet consent-switch fill */
    violetDeep: "#8B6DF0",
    /** ink knocked out on a violet fill */
    onViolet: "#0B0714",
    coralLt: "#FFB4AC",
    /** destructive label on glass (Delete row) */
    coralLt2: "#FFA79E",
    violetLt: "#C5A9FF",
    /** violet used for small chips + the active tab glyph (§1 photos) */
    violetChip: "#C4B0F7",
  /** chip text on the §7 approvals queue (staff register) */
  violetChipText: "#C3B2FF",
    /** — nutrition (amber family) — */
    /** section labels + the light end of the amber FAB / ring glow */
    amberLt: "#F8CD8B",
    /** deep end of the amber FAB gradient */
    amberDeep: "#EC9E40",
    /** estimate dot on the peach canvas */
    amberInk: "#E09636",
    /** "COACH ESTIMATE" label on the peach canvas (passes contrast on #F2E4D7) */
    amberInkText: "#A8681F",
    heart: "#FFB4AC",
    /** glass surface recipe (gradient fill + border) */
    glassHi: "rgba(255,255,255,0.09)",
    glassLo: "rgba(255,255,255,0.03)",
    glassHi2: "rgba(255,255,255,0.07)",
    glassLo2: "rgba(255,255,255,0.02)",
    border: "rgba(255,255,255,0.14)",
    border2: "rgba(255,255,255,0.12)",
    hairline: "rgba(255,255,255,0.09)",
    /** bottom-sheet scrim */
    scrim: "rgba(0,0,0,0.55)",
  },
  /** white-alpha text ramp for dark screens */
  alpha: (a: number): string => `rgba(244,242,248,${a})`,
  /** dark-ink alpha ramp for the light "moment" screens */
  inkAlpha: (a: number): string => `rgba(34,28,51,${a})`,
  /** teal-accent alpha ramp (Coach / "SYNCED" badge / assistant bubbles) */
  tealAlpha: (a: number): string => `rgba(94,212,192,${a})`,
  /** amber-accent alpha ramp (nutrition rings, coach-read card, amber FAB) */
  amberAlpha: (a: number): string => `rgba(245,184,92,${a})`,
  /** coral alpha ramp — destructive affordances only */
  coralAlpha: (a: number): string => `rgba(255,122,110,${a})`,
  /** magenta-accent alpha ramp (supplement rings, chips, ticks, banner) */
  magentaAlpha: (a: number): string => `rgba(232,107,199,${a})`,
  /** violet-accent alpha ramp (consent centre, trust layer) */
  violetAlpha: (a: number): string => `rgba(167,139,250,${a})`,
  /** blue-accent alpha ramp — §7 treatments, and the practitioner role */
  blueAlpha: (a: number): string => `rgba(108,168,255,${a})`,
  /** dark-ink alpha ramp for the pale-rose "Add to stack" moment */
  roseInkAlpha: (a: number): string => `rgba(44,25,38,${a})`,
  /** dark-ink alpha ramp for the peach "Add meal" moment */
  peachAlpha: (a: number): string => `rgba(46,33,19,${a})`,
  /** aurora radial-gradient rgb triples (feed react-native-svg RadialGradient) */
  aurora: {
    violet: "167,139,250",
    teal: "94,212,192",
    coral: "255,122,110",
    blue: "108,168,255",
    amber: "245,184,92",
    magenta: "232,107,199",
    purple: "124,86,255",
  },
  radius: { screen: 44, card: 24, tile: 24, pill: 999, sm: 16, xs: 12, sheet: 28 },
  /**
   * Client invitations (§13). The feature spans two registers: the staff
   * screens follow the restrained trainer bundle (flat rows, one static teal
   * bloom), the client screens the standard consumer system (glass, violet).
   * Values that differ between the two are named for their side.
   */
  /**
   * — §7 IV therapy & treatments —
   *
   * The status dot is the one element carrying regulatory weight: "pending
   * review" must never look like a confirmed booking, so the pending and
   * approved states differ in colour AND in fill, not colour alone.
   */
  treatment: {
    /** the disclaimer band above the suggestions a client sees */
    disclaimerRadius: 14,
    /** status dot on a client request row */
    dot: 9,
    /** icon plate on a suggestion card */
    plate: 38,
    cardRadius: 20,
    /* — practitioner approvals queue (design 5B, violet staff register) — */
    queue: {
      /** the Doto pending count in the header */
      count: 30,
      avatar: 36,
      /** pill actions: Decline / Approve, Cancel / Confirm decline */
      action: 44,
      /** status chip: pending / approved / declined */
      chipDot: 5,
      /** inline decline reason field — declining happens ON the card */
      reasonBox: 74,
      reasonRadius: 14,
      /** dot on a Decided today row */
      decidedDot: 6,
    },
  },
  /** — §3 fitness plans (coral) — */
  fitness: {
    /** intensity arc on the hero card */
    ring: 46,
    /** a day dot on the week spine */
    dot: 10,
    /** the tick box on an exercise row */
    check: 22,
    cardRadius: 20,
  },
  /** — §1 progress photos — */
  photos: {
    /** one tile in the 3-column dated grid */
    tile: { height: 137, radius: 16, gap: 8 },
    /** the scrim behind a tile's Doto date */
    scrim: 44,
    /** lock chip marking a photo whose visibility differs from the default */
    lockChip: 20,
    /** upload progress ring on an in-flight tile */
    ring: 34,
    /** dotted frame on the empty gallery */
    emptyFrame: { width: 190, height: 238, radius: 22 },
    /** floating add button on the gallery */
    fab: { size: 56, right: 20, bottom: 106 },
  },
  /**
   * §6 gym (A1–A6 handoff). Its own block rather than reuse of `invite`: the
   * switch is 44×26 there and 46×27 here, and the CTA is a flat solid fill
   * rather than the staff gradient. Two pixels is not worth a shared token that
   * is wrong for both.
   */
  gym: {
    /** the full-width Save / primary CTA */
    cta: { height: 46, radius: 999 },
    /** the "list me in the directory" switch */
    track: { width: 44, height: 26, radius: 999, pad: 2 },
    knob: 22,
    knobTravel: 18,
    /** the static bloom behind every gym screen */
    bloom: { size: 460, left: -150, top: -150, alpha: 0.08 },
    /** the selectable specialty chip (A6) */
    chip: { padV: 6, padH: 13, radius: 999, size: 12 },
    /** the venue / speciality FILTER chip (A1, A3) — a shade larger than A6's */
    filterChip: { padV: 7, padH: 14, radius: 999, size: 12.5 },
    /** the three square actions across the top of the schedule (A1) */
    tile: { radius: 18, padV: 11, padH: 12 },
    /** a class card, and the gap between two of them */
    card: { radius: 24, padV: 13, padH: 16, gap: 6 },
    /** the BOOKED / ATTENDED chip on a class card */
    statusChip: { padV: 4, padH: 10, radius: 999, size: 9.5 },
    /** Book (filled) and Cancel (outlined) on a class card */
    rowBtn: { padV: 7, padHFilled: 18, padHGhost: 16, radius: 999, size: 12.5 },
    /** filled input boxes (name, bio, booking link) */
    input: { radius: 16, padV: 11, padH: 14 },
  },
  invite: {
    /** the code itself, on the reveal screen */
    code: { fontFamily: fontFamily.dot, fontSize: 40, letterSpacing: 3.2 },
    /** the code as typed by the client */
    codeInput: { fontFamily: fontFamily.dot, fontSize: 36, letterSpacing: 3.6 },
    /** the dimmed code echoed back on an error screen */
    codeEcho: { fontFamily: fontFamily.dotBold, fontSize: 17, letterSpacing: 1.36 },
    codeBoxRadius: 18,
    /** the dashed expiry dial on the reveal screen */
    ring: 56,
    ringRadius: 24,
    ringStroke: 2,
    /** dash / gap of the dotted expiry arc */
    ringDash: "2.2 4.6",
    /** initials circles: the confirm hero, the connected hero, a care-team row */
    avatarConfirm: 68,
    avatarConnected: 76,
    avatarRow: 44,
    /** the ✓ badge that overlaps the connected hero */
    tickBadge: 26,
    /** staff CTAs sit slightly tighter than the consumer ones */
    ctaStaff: { height: 52, radius: 15 },
    ctaClient: { height: 54, radius: 16 },
    ctaSecondary: { height: 46, radius: 14 },
    /** the lock-to-email switch */
    track: { width: 46, height: 27, radius: 999, pad: 2.5 },
    knob: 22,
    knobTravel: 19,
    /** small solid status dot — never a glowing one on staff screens */
    dot: 6,
    /** the bullet on the client's honest-explainer rows */
    bullet: 5,
    /** the hollow ring on an error screen */
    errorRing: 64,
    errorDot: 7,
  },
  space: { xs: 4, sm: 8, md: 12, base: 16, lg: 18, xl: 24, xxl: 32 },
  type: {
    orb: { fontFamily: fontFamily.extrabold, fontSize: 92, lineHeight: 92, letterSpacing: -3.7 },
    dotXL: { fontFamily: fontFamily.dot, fontSize: 76, letterSpacing: 4.6 },
    dotClock: { fontFamily: fontFamily.dot, fontSize: 64, letterSpacing: 5.1 },
    dotClockLg: { fontFamily: fontFamily.dot, fontSize: 66, letterSpacing: 6.6 },
    metricXL: { fontFamily: fontFamily.extrabold, fontSize: 38, letterSpacing: -0.76 },
    metricL: { fontFamily: fontFamily.extrabold, fontSize: 34, letterSpacing: -0.68 },
    metricM: { fontFamily: fontFamily.extrabold, fontSize: 30, letterSpacing: -0.6 },
    title: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
    sheetTitle: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
    greeting: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.22 },
    heading: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 21 },
    body: { fontFamily: fontFamily.light, fontSize: 15, lineHeight: 22 },
    bodySm: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20 },
    label: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.76 },
    labelSm: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1 },
    chipVal: { fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: -0.15 },
    dotSm: { fontFamily: fontFamily.dot, fontSize: 16, letterSpacing: 0.9 },
    tab: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.4 },
    wordmark: { fontFamily: fontFamily.bold, fontSize: 34 },
  },
  motion: {
    breathe: 12000,
    breathe2: 14000,
    ringDraw: 1800,
    spin: 90000,
    press: 120,
    pressScale: 0.96,
    spring: { damping: 15, stiffness: 200 },
    easeOut: motion.easeEmphasized,
  },
} as const;

export const theme = { color, gradient, space, radius, size, type, fontFamily, motion, haptic, bio } as const;

export type Theme = typeof theme;
