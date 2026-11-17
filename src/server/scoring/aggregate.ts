import { randomUUID } from "node:crypto";
import {
  CATEGORY_WEIGHTS,
  PERFORMANCE_SUBWEIGHTS,
  ACCESSIBILITY_SUBWEIGHTS,
  SEVERITY_DEDUCTION,
  scoreFromDeductions,
  weightedAverage,
} from "../config/scoring";
import { rateMetric, CORE_WEB_VITALS_THRESHOLDS } from "../config/thresholds";
import type { FindingDraft } from "../engines/types";
import type { findings as findingsTable } from "../db/schema";

export type PageAuditResult = {
  auditPageId: string;
  pageUrl: string;
  device: "mobile" | "desktop";
  lighthousePerformanceScore: number | null;
  lighthouseSeoScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  tbtMs: number | null;
  headerScore: number | null;
  findings: FindingDraft[];
};

export type AggregatedScores = {
  performanceScore: number;
  seoScore: number;
  accessibilityScore: number;
  securityScore: number;
  overallScore: number;
};

type NewFindingRow = typeof findingsTable.$inferInsert;

function average(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return 100;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function sumDeductions(drafts: FindingDraft[]): number {
  return drafts.reduce((sum, d) => sum + SEVERITY_DEDUCTION[d.severity], 0);
}

export function computeScores(pages: PageAuditResult[]): AggregatedScores {
  const allFindings = pages.flatMap((p) => p.findings);

  // Performance: blend of raw Lighthouse performance score and the share of
  // (page, device) combos whose lab metrics are all "good" against the
  // documented Core Web Vitals thresholds (LCP/CLS; TBT as the INP lab proxy).
  const lighthousePerfAvg = average(pages.map((p) => p.lighthousePerformanceScore ?? 0));
  const passCount = pages.filter((p) => {
    const lcp = rateMetric(p.lcpMs, CORE_WEB_VITALS_THRESHOLDS.lcpMs);
    const cls = rateMetric(p.clsScore, CORE_WEB_VITALS_THRESHOLDS.cls);
    const tbt = rateMetric(p.tbtMs, CORE_WEB_VITALS_THRESHOLDS.tbtMs);
    return lcp === "good" && cls === "good" && tbt === "good";
  }).length;
  const cwvPassRate = pages.length > 0 ? (passCount / pages.length) * 100 : 100;
  const performanceScore = weightedAverage([
    { value: lighthousePerfAvg, weight: PERFORMANCE_SUBWEIGHTS.lighthousePerformance },
    { value: cwvPassRate, weight: PERFORMANCE_SUBWEIGHTS.coreWebVitalsPass },
  ]);

  // SEO: blend of raw Lighthouse SEO score and a deduction-based score from
  // our own SEO finding severities (duplicate titles, missing meta, etc).
  const lighthouseSeoAvg = average(pages.map((p) => p.lighthouseSeoScore ?? 0));
  const seoDeductionScore = scoreFromDeductions(
    sumDeductions(allFindings.filter((f) => f.category === "seo")),
  );
  const seoScore = weightedAverage([
    { value: lighthouseSeoAvg, weight: 0.5 },
    { value: seoDeductionScore, weight: 0.5 },
  ]);

  // Accessibility: axe-core and Pa11y each scored independently from their
  // own raw (non-deduplicated) violation counts, then blended.
  const axeScore = scoreFromDeductions(
    sumDeductions(allFindings.filter((f) => f.category === "accessibility" && f.engine === "axe-core")),
  );
  const pa11yScore = scoreFromDeductions(
    sumDeductions(allFindings.filter((f) => f.category === "accessibility" && f.engine === "pa11y-htmlcs")),
  );
  const accessibilityScore = weightedAverage([
    { value: axeScore, weight: ACCESSIBILITY_SUBWEIGHTS.axeScore },
    { value: pa11yScore, weight: ACCESSIBILITY_SUBWEIGHTS.pa11yScore },
  ]);

  // Security: blend of the header-grade average and a deduction score from
  // every other security finding (TLS, mixed content, exposed files...).
  const headerScoreAvg = average(pages.map((p) => p.headerScore ?? 100));
  const otherSecurityDeductionScore = scoreFromDeductions(
    sumDeductions(allFindings.filter((f) => f.category === "security" && f.engine !== "header-check")),
  );
  const securityScore = weightedAverage([
    { value: headerScoreAvg, weight: 0.6 },
    { value: otherSecurityDeductionScore, weight: 0.4 },
  ]);

  const overallScore = weightedAverage([
    { value: performanceScore, weight: CATEGORY_WEIGHTS.performance },
    { value: seoScore, weight: CATEGORY_WEIGHTS.seo },
    { value: accessibilityScore, weight: CATEGORY_WEIGHTS.accessibility },
    { value: securityScore, weight: CATEGORY_WEIGHTS.security },
  ]);

  return { performanceScore, seoScore, accessibilityScore, securityScore, overallScore };
}

/**
 * Deduplicates findings that share the same root cause (same engine + rule,
 * or an explicit groupKeyOverride) across pages into one row per issue, with
 * every affected page recorded in evidence/affectedPageIds. This is what
 * turns "8 separate alt-text findings" into "missing alt text, affects 8 pages".
 */
export function deduplicateFindings(pages: PageAuditResult[], auditId: string): NewFindingRow[] {
  type Group = { drafts: FindingDraft[]; pageIds: Set<string> };
  const groups = new Map<string, Group>();

  for (const page of pages) {
    for (const draft of page.findings) {
      const key = draft.groupKeyOverride ?? `${draft.engine}:${draft.title}`;
      const group = groups.get(key) ?? { drafts: [], pageIds: new Set() };
      group.drafts.push(draft);
      group.pageIds.add(page.auditPageId);
      groups.set(key, group);
    }
  }

  const rows: NewFindingRow[] = [];
  for (const [groupKey, group] of groups) {
    const representative = group.drafts[0]!;
    const mergedEvidence = group.drafts.flatMap((d) => d.evidence).slice(0, 25);
    rows.push({
      id: randomUUID(),
      auditId,
      groupKey,
      category: representative.category,
      engine: representative.engine,
      title: representative.title,
      explanation: representative.explanation,
      businessImpact: representative.businessImpact,
      severity: representative.severity,
      effort: representative.effort,
      impact: representative.impact,
      wcagCriteria: representative.wcagCriteria,
      evidence: mergedEvidence,
      fixSuggestion: representative.fixSuggestion,
      affectedPageIds: [...group.pageIds],
      status: "open",
      note: null,
      aiRewritten: false,
    });
  }

  return rows;
}
