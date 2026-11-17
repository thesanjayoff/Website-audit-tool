import type { audits as auditsTable, findings as findingsTable } from "../db/schema";

type Audit = typeof auditsTable.$inferSelect;
type Finding = typeof findingsTable.$inferSelect;

export type ScoreDelta = { category: string; previous: number | null; current: number | null; delta: number | null };

export function computeScoreDeltas(current: Audit, previous: Audit | null): ScoreDelta[] {
  const pairs: Array<[string, number | null, number | null]> = [
    ["Overall", previous?.overallScore ?? null, current.overallScore],
    ["Performance", previous?.performanceScore ?? null, current.performanceScore],
    ["SEO", previous?.seoScore ?? null, current.seoScore],
    ["Accessibility", previous?.accessibilityScore ?? null, current.accessibilityScore],
    ["Security", previous?.securityScore ?? null, current.securityScore],
  ];
  return pairs.map(([category, prev, curr]) => ({
    category,
    previous: prev,
    current: curr,
    delta: prev != null && curr != null ? Math.round((curr - prev) * 10) / 10 : null,
  }));
}

export type FindingsDiff = { newFindings: Finding[]; resolvedFindings: Finding[]; persistingFindings: Finding[] };

/** "What changed since last audit": matches findings across audits by their stable groupKey. */
export function computeFindingsDiff(currentFindings: Finding[], previousFindings: Finding[] | null): FindingsDiff {
  if (!previousFindings) {
    return { newFindings: currentFindings, resolvedFindings: [], persistingFindings: [] };
  }
  const previousKeys = new Set(previousFindings.map((f) => f.groupKey));
  const currentKeys = new Set(currentFindings.map((f) => f.groupKey));

  return {
    newFindings: currentFindings.filter((f) => !previousKeys.has(f.groupKey)),
    resolvedFindings: previousFindings.filter((f) => !currentKeys.has(f.groupKey)),
    persistingFindings: currentFindings.filter((f) => previousKeys.has(f.groupKey)),
  };
}
