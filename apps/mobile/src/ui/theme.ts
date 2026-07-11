/**
 * Pulse design tokens — the single source of truth for the whole app.
 *
 * Extracted from the "Pulse Auth Flow" design spec (colors, gradient stops, spacing,
 * radii, type scale, motion timings, haptics). Every screen inherits these; components
 * must never hard-code a hex, duration, or spacing value — import from here.
 *
 * Translation notes (native, not web):
 *  - Depth = elevated `surface` on `bg` + 1px `hairline` borders. No blur, no shadows.
 *  - Linear gradients (CTA, focus underline, strength bar) → expo-linear-gradient.
 *  - Radial glow blobs → react-native-svg <RadialGradient> (see `gradient.glow`).
 */
import { Easing } from "react-native-reanimated";

// ── Color ──────────────────────────────────────────────────────────────────────
export const color = {
  /** app background */
  bg: "#0A0A0F",
  /** page/backdrop deep black (behind the device in the design) */
  bgDeep: "#060609",
  /** elevated surface (cards, pills) */
  surface: "#131318",
  /** alternate elevated surface (spec panel) */
  surfaceAlt: "#101014",
  /** code/inset surface */
  surfaceCode: "#0B0B10",

  /** 1px hairline border on elevated surfaces */
  hairline: "rgba(255,255,255,0.08)",
  /** ghost-button / stronger border */
  border: "rgba(255,255,255,0.14)",
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
  /** resting floating-label text */
  textLabel: "rgba(255,255,255,0.42)",

  /** brand */
  magenta: "#D6408E",
  purple: "#7C5CFF",
  orange: "#F2794B",

  /** error text + focused label on error */
  error: "#E5645F",
  /** error underline/border */
  errorBorder: "rgba(229,100,95,0.70)",

  /** link / accent text */
  link: "#B9A6FF",
  linkHover: "#D6C6FF",

  /** input caret */
  caret: "#7C5CFF",
  /** text on a gradient fill */
  onGradient: "#FFFFFF",
} as const;

// ── Gradient ───────────────────────────────────────────────────────────────────
// Brand gradient used by CTA fills, focus underlines, and the strength bar.
export const gradient = {
  brandColors: ["#D6408E", "#7C5CFF", "#F2794B"] as const,
  brandLocations: [0, 0.52, 1] as const,

  /** CTA fill uses a slight diagonal */
  ctaStart: { x: 0, y: 0 } as const,
  ctaEnd: { x: 1, y: 0.6 } as const,

  /** underline + strength bar run horizontally */
  lineStart: { x: 0, y: 0.5 } as const,
  lineEnd: { x: 1, y: 0.5 } as const,

  /** logo dot uses a 135deg diagonal */
  logoStart: { x: 0, y: 0 } as const,
  logoEnd: { x: 1, y: 1 } as const,

  /**
   * Ambient radial glow blobs (react-native-svg RadialGradient).
   * Animate transform only (drift) — never re-render the gradient.
   */
  glow: {
    purple: { color: "rgba(124,92,255,0.30)", mid: "rgba(124,92,255,0.10)", size: 520 },
    magenta: { color: "rgba(214,64,142,0.22)", mid: "rgba(242,121,75,0.08)", size: 480 },
  },
} as const;

// ── Spacing & radii (dp) ─────────────────────────────────────────────────────────
export const space = {
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
  pill: 999,
} as const;

export const size = {
  /** horizontal screen padding */
  screenPadX: 24,
  /** field row height */
  fieldRow: 64,
  /** gap between fields */
  fieldGap: 10,
  /** CTA / ghost button height */
  ctaHeight: 56,
  /** minimum touch target (back button, Show/Hide toggle) */
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
    rise: 420, // welcome entrance per element
    stagger: 100, // delay between entrance elements
    screen: 280, // push / pop
    fadeOut: 180, // fade-through out
    fadeIn: 260, // fade-through in
    press: 120, // CTA press-in scale
    label: 180, // floating label lift
    underline: 200, // focus underline scaleX
    strength: 250, // strength bar width
    errorBorder: 200, // error border color
    shake: 320, // error shake (total)
    spinner: 800, // CTA spinner rotation
  },

  drift1: 14000, // ambient blob A
  drift2: 18000, // ambient blob B

  /** CTA press-in target scale */
  pressScale: 0.97,
  /** spring used on press release */
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
  press: "light", // Haptics.impactAsync(Light) on CTA press-in
  success: "success", // Haptics.notificationAsync(Success)
  error: "error", // Haptics.notificationAsync(Error)
  toggle: "selection", // Haptics.selectionAsync() on Show/Hide
} as const;

export const theme = { color, gradient, space, radius, size, type, fontFamily, motion, haptic } as const;

export type Theme = typeof theme;
