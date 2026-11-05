/**
 * How much of the screen the software keyboard is actually covering.
 *
 * On the S23 the keyboard sat on top of Ask's "Ask anything…" composer: you
 * could type, but not see what you typed. The screen was watching only
 * *whether* the keyboard was up and then trimming its bottom padding, which
 * assumes the window shrinks to get out of the keyboard's way. Under the
 * edge-to-edge window that Expo SDK 54 puts us in on Android, it doesn't — the
 * app keeps the full height and draws behind the keyboard, so trimming padding
 * moved the composer further *under* it.
 *
 * Padding by the keyboard's own height would fix that build and break any
 * build where the window does resize, by double-counting the same gap. So
 * measure the overlap instead: how far the keyboard's top edge is above the
 * bottom of the window.
 *
 *   window resizes   → the window already ends where the keyboard starts → 0
 *   window does not  → the overlap is the keyboard's height
 *
 * One formula, right either way, and nothing to keep in step with a platform
 * default we don't control. `keyboardScreenY` is `endCoordinates.screenY` from
 * a `keyboardDidShow` event — the keyboard's top in screen coordinates.
 */
export function keyboardOverlap(windowHeight: number, keyboardScreenY: number): number {
  // A nonsense measurement must not move the layout at all. Both values arrive
  // from the platform, and a 0 or a NaN is a measurement we don't have.
  if (!Number.isFinite(windowHeight) || !Number.isFinite(keyboardScreenY)) return 0;
  if (windowHeight <= 0 || keyboardScreenY <= 0) return 0;
  return Math.max(0, windowHeight - keyboardScreenY);
}
