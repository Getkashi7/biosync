/**
 * The keyboard overlap, in the two worlds this app can be built into.
 *
 * The bug it comes from: Ask's composer was unreadable with the keyboard up,
 * because the screen assumed the window shrinks for the keyboard. On SDK 54's
 * edge-to-edge Android window it doesn't. The point of `keyboardOverlap` is to
 * not care which of those is true, so both are asserted here — including the
 * one that isn't live today, since the thing that broke was a platform default
 * changing underneath a screen that had hard-coded an assumption about it.
 */
import { describe, it, expect } from "vitest";
import { keyboardOverlap } from "../keyboard";

// An S23-ish window, in dp.
const WINDOW = 915;

describe("a window that does not resize (edge-to-edge Android, iOS)", () => {
  it("reports the keyboard's height as the overlap", () => {
    // Keyboard 320 tall: its top edge is 320 above the bottom of the window.
    expect(keyboardOverlap(WINDOW, WINDOW - 320)).toBe(320);
  });

  it("scales with a taller keyboard, so a language with a suggestion strip still fits", () => {
    expect(keyboardOverlap(WINDOW, WINDOW - 420)).toBe(420);
  });
});

describe("a window that does resize", () => {
  it("reports no overlap, because the window already ends at the keyboard", () => {
    // The window shrank to 595; the keyboard's top is at 595 in screen coords.
    expect(keyboardOverlap(595, 595)).toBe(0);
  });

  it("never returns a negative, so a slightly over-shrunk window can't pull the layout down", () => {
    expect(keyboardOverlap(595, 600)).toBe(0);
  });
});

describe("measurements we don't have", () => {
  it("treats zero and negative values as no measurement", () => {
    expect(keyboardOverlap(0, 0)).toBe(0);
    expect(keyboardOverlap(WINDOW, 0)).toBe(0);
    expect(keyboardOverlap(-1, 100)).toBe(0);
  });

  it("never propagates NaN into a style, which would blank the screen", () => {
    expect(keyboardOverlap(Number.NaN, 500)).toBe(0);
    expect(keyboardOverlap(WINDOW, Number.NaN)).toBe(0);
    expect(keyboardOverlap(Number.POSITIVE_INFINITY, 500)).toBe(0);
  });
});
