import { describe, it, expect } from "vitest";
import { deduplicateFindings, type PageAuditResult } from "@/server/scoring/aggregate";
import type { FindingDraft } from "@/server/engines/types";

function makePage(id: string, url: string, findings: FindingDraft[]): PageAuditResult {
  return {
    auditPageId: id,
    pageUrl: url,
    device: "desktop",
    lighthousePerformanceScore: 90,
    lighthouseSeoScore: 90,
    lcpMs: 1000,
    clsScore: 0.01,
    tbtMs: 100,
    headerScore: 90,
    findings,
  };
}

function missingAltDraft(): FindingDraft {
  return {
    category: "accessibility",
    engine: "axe-core",
    title: "Images must have alternative text",
    explanation: "...",
    businessImpact: "...",
    severity: "critical",
    effort: "low",
    impact: "high",
    evidence: [{ pageUrl: "placeholder" }],
    fixSuggestion: "Add alt text",
    wcagCriteria: ["1.1.1"],
    groupKeyOverride: "axe-core:image-alt",
  };
}

describe("deduplicateFindings", () => {
  it("merges the same root-cause issue across many pages into a single finding", () => {
    const pages: PageAuditResult[] = [];
    for (let i = 1; i <= 8; i++) {
      const draft = missingAltDraft();
      draft.evidence = [{ pageUrl: `https://example.com/page-${i}` }];
      pages.push(makePage(`p${i}`, `https://example.com/page-${i}`, [draft]));
    }

    const rows = deduplicateFindings(pages, "audit-1");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.affectedPageIds).toHaveLength(8);
    expect(rows[0]!.groupKey).toBe("axe-core:image-alt");
    expect(rows[0]!.evidence.length).toBeGreaterThan(0);
  });

  it("keeps distinct issues separate even on the same page", () => {
    const altDraft = missingAltDraft();
    const headerDraft: FindingDraft = {
      category: "security",
      engine: "header-check",
      title: "Missing Content-Security-Policy header",
      explanation: "...",
      businessImpact: "...",
      severity: "high",
      effort: "low",
      impact: "high",
      evidence: [{ pageUrl: "https://example.com" }],
      fixSuggestion: "Add a CSP",
      wcagCriteria: [],
    };

    const pages = [makePage("p1", "https://example.com", [altDraft, headerDraft])];
    const rows = deduplicateFindings(pages, "audit-1");

    expect(rows).toHaveLength(2);
    const groupKeys = rows.map((r) => r.groupKey).sort();
    expect(groupKeys).toEqual(["axe-core:image-alt", "header-check:Missing Content-Security-Policy header"].sort());
  });

  it("falls back to engine:title as the group key when no override is given", () => {
    const draft: FindingDraft = {
      category: "seo",
      engine: "seo-checks",
      title: "Missing meta description",
      explanation: "...",
      businessImpact: "...",
      severity: "medium",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl: "https://example.com/a" }],
      fixSuggestion: "Add one",
      wcagCriteria: [],
    };
    const draft2 = { ...draft, evidence: [{ pageUrl: "https://example.com/b" }] };

    const pages = [makePage("p1", "https://example.com/a", [draft]), makePage("p2", "https://example.com/b", [draft2])];
    const rows = deduplicateFindings(pages, "audit-1");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.groupKey).toBe("seo-checks:Missing meta description");
    expect(rows[0]!.affectedPageIds.sort()).toEqual(["p1", "p2"]);
  });

  it("caps merged evidence at 25 entries even when far more pages are affected", () => {
    const pages: PageAuditResult[] = [];
    for (let i = 1; i <= 40; i++) {
      const draft = missingAltDraft();
      draft.evidence = [{ pageUrl: `https://example.com/page-${i}` }];
      pages.push(makePage(`p${i}`, `https://example.com/page-${i}`, [draft]));
    }
    const rows = deduplicateFindings(pages, "audit-1");
    expect(rows[0]!.evidence.length).toBeLessThanOrEqual(25);
    expect(rows[0]!.affectedPageIds).toHaveLength(40);
  });
});
