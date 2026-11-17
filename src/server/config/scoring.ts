/**
 * Transparent, documented scoring formula. All weights live here so the
 * report's methodology section and the operator can see and adjust exactly
 * how a 0-100 score is produced. Nothing here is a black box: every category
 * score is a weighted average of concrete, visible sub-metrics, and the
 * overall score is a weighted average of the four category scores.
 */

export const CATEGORY_WEIGHTS = {
  performance: 0.3,
  seo: 0.25,
  accessibility: 0.25,
  security: 0.2,
} as const;

export type Category = keyof typeof CATEGORY_WEIGHTS;

/** Performance category = average of mobile+desktop Lighthouse performance score (0-100), each already 0-100. */
export const PERFORMANCE_SUBWEIGHTS = {
  lighthousePerformance: 0.7,
  coreWebVitalsPass: 0.3, // share of audited pages whose lab LCP/CLS (+ TBT proxy) are "good"
};

/** Accessibility category blends axe-core + Pa11y violation density with manual-check awareness. */
export const ACCESSIBILITY_SUBWEIGHTS = {
  axeScore: 0.6,
  pa11yScore: 0.4,
};

// Severity -> points deducted per occurrence when turning raw violation counts
// into a 0-100 score via a diminishing-returns curve (see scoreFromDeductions).
export const SEVERITY_DEDUCTION: Record<"critical" | "high" | "medium" | "low" | "info", number> = {
  critical: 12,
  high: 7,
  medium: 3,
  low: 1,
  info: 0,
};

/**
 * Converts a list of per-page deduction totals into a 0-100 score using a
 * square-root dampener, so the 1st critical issue hurts a lot more than the
 * 20th (one broken thing repeated on every page shouldn't zero the score).
 */
export function scoreFromDeductions(totalDeductions: number): number {
  if (totalDeductions <= 0) return 100;
  const damped = Math.sqrt(totalDeductions) * 10;
  return Math.max(0, Math.round(100 - damped));
}

export function weightedAverage(parts: Array<{ value: number; weight: number }>): number {
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;
  const sum = parts.reduce((acc, p) => acc + p.value * p.weight, 0);
  return Math.round((sum / totalWeight) * 10) / 10;
}

// Deliberately separate tables: a "high" rating is good news for impact
// (weight it up) but bad news for effort (weight it down). Reusing one
// shared table for both — as an earlier version of this function did —
// silently inverted the ranking, scoring "low impact/high effort" above
// "high impact/low effort".
const IMPACT_SCORE: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };
const EFFORT_SCORE: Record<"low" | "medium" | "high", number> = { low: 3, medium: 2, high: 1 };

/** Higher is more urgent: high impact + low effort bubbles to the top. */
export function priorityScore(impact: "low" | "medium" | "high", effort: "low" | "medium" | "high"): number {
  return IMPACT_SCORE[impact] * 3 + EFFORT_SCORE[effort];
}
