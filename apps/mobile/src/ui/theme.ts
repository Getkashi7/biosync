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
} as const;

// ── Gradient ───────────────────────────────────────────────────────────────────
// Brand gradient used by CTA fills, the FAB, slider fill, focus underlines, and
// the strength bar. SVG strokes (ring arc, charts, checkmark) reuse the same stops.
export const gradient = {
  brandColors: ["#FF8C42", "#FF5E62", "#4A7DFF"] as const,
  brandLocations: [0, 0.45, 1] as const,

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
} as const;

// ── Typography ──────────────────────────────────────────────────────────────────
// Font family keys map to the loaded Space Grotesk weights (see useAppFonts()).
export const fontFamily = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
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
    chartDraw: 900, // trend sparkline draw-in
    chartDrawDelay: 500, // sparkline starts after the ring is underway

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

export const theme = { color, gradient, space, radius, size, type, fontFamily, motion, haptic } as const;

export type Theme = typeof theme;
