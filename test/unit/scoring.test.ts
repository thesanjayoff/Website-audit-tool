import { describe, it, expect } from "vitest";
import { scoreFromDeductions, weightedAverage, priorityScore } from "@/server/config/scoring";
import { computeScores, type PageAuditResult } from "@/server/scoring/aggregate";
import { sortByPriority, topFixes, quickWins } from "@/server/scoring/prioritize";
import type { findings as findingsTable } from "@/server/db/schema";
import type { FindingDraft } from "@/server/engines/types";

type Finding = typeof findingsTable.$inferSelect;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? "f1",
    auditId: "audit-1",
    groupKey: overrides.groupKey ?? "engine:title",
    category: "seo",
    engine: "seo-checks",
    title: "Example finding",
    explanation: "explanation",
    businessImpact: "impact",
    severity: "medium",
    effort: "low",
    impact: "medium",
    wcagCriteria: [],
    evidence: [{ pageUrl: "https://example.com" }],
    fixSuggestion: "fix it",
    affectedPageIds: ["p1"],
    status: "open",
    note: null,
    aiRewritten: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDraft(overrides: Partial<FindingDraft> = {}): FindingDraft {
  return {
    category: "seo",
    engine: "seo-checks",
    title: "Example",
    explanation: "x",
    businessImpact: "x",
    severity: "medium",
    effort: "low",
    impact: "medium",
    evidence: [{ pageUrl: "https://example.com" }],
    fixSuggestion: "x",
    wcagCriteria: [],
    ...overrides,
  };
}

describe("scoreFromDeductions", () => {
  it("returns 100 when there are no deductions", () => {
    expect(scoreFromDeductions(0)).toBe(100);
  });

  it("dampens repeated issues so the 10th point costs less than the 1st", () => {
    const first = 100 - scoreFromDeductions(10);
    const incremental = scoreFromDeductions(90) - scoreFromDeductions(100);
    expect(first).toBeGreaterThan(Math.abs(incremental));
  });

  it("never goes below 0", () => {
    expect(scoreFromDeductions(100000)).toBe(0);
  });
});

describe("weightedAverage", () => {
  it("weights contributions proportionally", () => {
    const result = weightedAverage([
      { value: 100, weight: 1 },
      { value: 0, weight: 1 },
    ]);
    expect(result).toBe(50);
  });

  it("returns 0 for an empty/zero-weight input instead of NaN", () => {
    expect(weightedAverage([])).toBe(0);
  });
});

describe("priorityScore", () => {
  it("ranks high-impact/low-effort above low-impact/high-effort", () => {
    expect(priorityScore("high", "low")).toBeGreaterThan(priorityScore("low", "high"));
  });
});

describe("computeScores", () => {
  it("gives a perfect site a perfect score across every category", () => {
    const pages: PageAuditResult[] = [
      {
        auditPageId: "p1",
        pageUrl: "https://example.com/",
        device: "desktop",
        lighthousePerformanceScore: 100,
        lighthouseSeoScore: 100,
        lcpMs: 1000,
        clsScore: 0,
        tbtMs: 50,
        headerScore: 100,
        findings: [],
      },
    ];
    const scores = computeScores(pages);
    expect(scores.performanceScore).toBe(100);
    expect(scores.seoScore).toBe(100);
    expect(scores.accessibilityScore).toBe(100);
    expect(scores.securityScore).toBe(100);
    expect(scores.overallScore).toBe(100);
  });

  it("penalizes performance when Core Web Vitals are poor even with a high lab score", () => {
    const good: PageAuditResult = {
      auditPageId: "p1",
      pageUrl: "https://example.com/",
      device: "desktop",
      lighthousePerformanceScore: 90,
      lighthouseSeoScore: 100,
      lcpMs: 1000,
      clsScore: 0,
      tbtMs: 50,
      headerScore: 100,
      findings: [],
    };
    const poorCwv: PageAuditResult = { ...good, lcpMs: 9000, clsScore: 0.9, tbtMs: 2000 };

    const scoresGood = computeScores([good]);
    const scoresPoor = computeScores([poorCwv]);
    expect(scoresPoor.performanceScore).toBeLessThan(scoresGood.performanceScore);
  });

  it("lowers the accessibility score as critical axe-core violations accumulate", () => {
    const withViolations: PageAuditResult = {
      auditPageId: "p1",
      pageUrl: "https://example.com/",
      device: "desktop",
      lighthousePerformanceScore: 100,
      lighthouseSeoScore: 100,
      lcpMs: 1000,
      clsScore: 0,
      tbtMs: 50,
      headerScore: 100,
      findings: [
        makeDraft({ category: "accessibility", engine: "axe-core", severity: "critical" }),
        makeDraft({ category: "accessibility", engine: "axe-core", severity: "critical" }),
      ],
    };
    const scores = computeScores([withViolations]);
    expect(scores.accessibilityScore).toBeLessThan(100);
  });

  it("does not let security header findings leak into the performance score", () => {
    const page: PageAuditResult = {
      auditPageId: "p1",
      pageUrl: "https://example.com/",
      device: "desktop",
      lighthousePerformanceScore: 100,
      lighthouseSeoScore: 100,
      lcpMs: 1000,
      clsScore: 0,
      tbtMs: 50,
      headerScore: 0, // worst possible header grade
      findings: [makeDraft({ category: "security", engine: "header-check", severity: "critical" })],
    };
    const scores = computeScores([page]);
    expect(scores.performanceScore).toBe(100);
    expect(scores.securityScore).toBeLessThan(100);
  });
});

describe("prioritize", () => {
  it("sorts open findings with the best impact/effort ratio first", () => {
    const low = makeFinding({ id: "a", impact: "low", effort: "high" });
    const high = makeFinding({ id: "b", impact: "high", effort: "low" });
    const sorted = sortByPriority([low, high]);
    expect(sorted[0]!.id).toBe("b");
  });

  it("topFixes excludes already-resolved findings", () => {
    const open = makeFinding({ id: "open", status: "open" });
    const fixed = makeFinding({ id: "fixed", status: "fixed" });
    const result = topFixes([open, fixed], 5);
    expect(result.map((f) => f.id)).toEqual(["open"]);
  });

  it("quickWins only includes low-effort, medium/high-impact open findings", () => {
    const quickWin = makeFinding({ id: "qw", effort: "low", impact: "high" });
    const notQuick = makeFinding({ id: "nq", effort: "high", impact: "high" });
    const lowImpact = makeFinding({ id: "li", effort: "low", impact: "low" });
    const result = quickWins([quickWin, notQuick, lowImpact], 10);
    expect(result.map((f) => f.id)).toEqual(["qw"]);
  });
});
