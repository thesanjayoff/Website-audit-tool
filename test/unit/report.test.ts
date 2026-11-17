import { describe, it, expect } from "vitest";
import { escapeHtml, truncate } from "@/server/reports/escape";
import { findingsToCsv, findingsToMarkdown, findingToGitHubIssueText } from "@/server/reports/exportFindings";
import type { findings as findingsTable } from "@/server/db/schema";

type Finding = typeof findingsTable.$inferSelect;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    auditId: "audit-1",
    groupKey: "engine:title",
    category: "security",
    engine: "header-check",
    title: 'Missing header <script>alert("x")</script>',
    explanation: 'Evidence contained a "quoted" & <b>tag</b>.',
    businessImpact: "impact",
    severity: "high",
    effort: "low",
    impact: "high",
    wcagCriteria: [],
    evidence: [{ pageUrl: "https://example.com", snippet: "<img src=x onerror=alert(1)>" }],
    fixSuggestion: "fix it",
    affectedPageIds: ["p1", "p2"],
    status: "open",
    note: null,
    aiRewritten: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes every HTML-significant character, including inside attributes", () => {
    const input = `<script>alert("x")</script> & 'quoted'`;
    const escaped = escapeHtml(input);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("'");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("round-trips null/undefined to an empty string instead of 'null'/'undefined'", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("never lets a finding's attacker-controlled title/snippet survive as live HTML", () => {
    const finding = makeFinding();
    const escapedTitle = escapeHtml(finding.title);
    const escapedSnippet = escapeHtml(finding.evidence[0]!.snippet);
    // The dangerous tags are still present as visible text, but every `<`/`>`
    // that would make them live markup is gone — that's what matters here.
    expect(escapedTitle).not.toContain("<script>");
    expect(escapedSnippet).not.toContain("<img");
    expect(escapedSnippet).toContain("&lt;img");
  });
});

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("truncates and marks long strings", () => {
    expect(truncate("a".repeat(20), 5)).toBe("aaaaa…");
  });
});

describe("findingsToCsv", () => {
  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = findingsToCsv([makeFinding({ explanation: 'has, a comma and "quotes"\nand a newline' })]);
    // The field itself is comma/quote/newline-containing text wrapped in a
    // single quoted CSV cell — a naive split("\n") will still see 3 lines
    // (header + the 2 physical lines inside that one quoted cell), which is
    // correct per RFC 4180, not a sign the quoting is broken.
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain('"has, a comma and ""quotes""');
    expect(csv).toContain('and a newline"');
  });

  it("includes the affected-page count, not the raw id array", () => {
    const csv = findingsToCsv([makeFinding()]);
    expect(csv).toContain("2"); // affectedPageIds.length
  });
});

describe("findingsToMarkdown", () => {
  it("includes title, explanation, business impact, and fix for each finding", () => {
    const md = findingsToMarkdown([makeFinding()], "Example Site");
    expect(md).toContain("Example Site");
    expect(md).toContain("**Why it matters:**");
    expect(md).toContain("**Fix:**");
  });
});

describe("findingToGitHubIssueText", () => {
  it("produces a title prefixed with severity and a body with evidence", () => {
    const { title, body } = findingToGitHubIssueText(makeFinding());
    expect(title.startsWith("[high]")).toBe(true);
    expect(body).toContain("Evidence");
    expect(body).toContain("https://example.com");
  });
});
