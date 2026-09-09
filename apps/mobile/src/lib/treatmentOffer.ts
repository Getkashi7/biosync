/**
 * When the §7 offer may appear — the throttle on the one surface in this app
 * that could become predatory.
 *
 * An offer that follows someone around after a single bad night is exactly the
 * failure the ASA's rules on health claims exist to prevent, and it is also
 * just a bad app. So the decision to show it is split out here, as a pure
 * function over explicit inputs, and every condition is one you can read:
 *
 * - There must be a **real suggestion**, which already means the user's own
 *   readings crossed a threshold over a week, not one day.
 * - They must **have a practitioner**. Without one the offer leads to a screen
 *   that can only tell them they cannot ask — an invitation to a dead end.
 * - They must have **no open request** for it, or we would be nudging someone
 *   to ask a question they have already asked.
 * - And it is **rate limited hard**: once every 14 days, dismissed or not.
 *
 * The last one is deliberately not "once until dismissed". Someone who ignores
 * a sheet has told us something, and re-asking tomorrow is how a nudge becomes
 * nagging.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const SHOWN_KEY = "treatments.offer.lastShownAt";

/** Minimum gap between offers, whatever the user did with the last one. */
export const OFFER_COOLDOWN_DAYS = 14;

export type OfferInputs = {
  /** how many protocols the user's own readings surfaced */
  suggestionCount: number;
  /** whether anyone could actually review a request */
  hasPractitioner: boolean;
  /** requests already awaiting a decision or approved */
  openRequestCount: number;
  /** epoch ms of the last offer, or null if never shown */
  lastShownAt: number | null;
  now: number;
};

/**
 * Whether the offer may be shown. Pure, so the rules above are testable
 * without a storage layer or a clock.
 */
export function shouldOffer(input: OfferInputs): boolean {
  if (input.suggestionCount === 0) return false;
  if (!input.hasPractitioner) return false;
  if (input.openRequestCount > 0) return false;
  if (input.lastShownAt === null) return true;

  // A clock that has gone backwards (timezone change, manual set) must not
  // unlock the offer early — treat any negative gap as "just shown".
  const elapsed = input.now - input.lastShownAt;
  if (elapsed < 0) return false;
  return elapsed >= OFFER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

/** When the offer was last shown. Null on a fresh install or unreadable value. */
export async function lastOfferAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Storage is unavailable. Failing closed here would mean never offering;
    // failing open would mean offering every launch. Null reads as "never
    // shown", and the caller writes immediately after showing, so the worst
    // case is one extra offer rather than a loop.
    return null;
  }
}

/** Record that it was shown, so the cooldown starts. Never throws. */
export async function markOfferShown(now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(SHOWN_KEY, String(now));
  } catch {
    // Not worth surfacing — the offer already appeared.
  }
}
