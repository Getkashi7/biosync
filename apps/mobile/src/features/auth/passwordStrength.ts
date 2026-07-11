/**
 * Password strength scoring — mirrors the design prototype exactly.
 * score 0 (empty) · 1 weak · 2 good · 3 strong.
 */
export type StrengthScore = 0 | 1 | 2 | 3;

export function scorePassword(p: string): StrengthScore {
  let score: StrengthScore = 0;
  if (p.length > 0) score = 1;
  if (p.length >= 8) score = 2;
  if (p.length >= 8 && ((/\d/.test(p) && /[A-Z]/.test(p)) || p.length >= 12)) score = 3;
  return score;
}

export const STRENGTH_PCT: Record<StrengthScore, string> = {
  0: "0%",
  1: "33%",
  2: "66%",
  3: "100%",
};

export const STRENGTH_LABEL: Record<StrengthScore, string> = {
  0: "",
  1: "Weak — 8+ characters recommended",
  2: "Good",
  3: "Strong",
};
