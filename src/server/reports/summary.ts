import type { findings as findingsTable, audits as auditsTable } from "../db/schema";
import { topFixes, quickWins } from "../scoring/prioritize";

type Finding = typeof findingsTable.$inferSelect;
type Audit = typeof auditsTable.$inferSelect;

function scoreWord(score: number | null): string {
  if (score == null) return "unknown";
  if (score >= 90) return "excellent";
  if (score >= 70) return "good, with some room to improve";
  if (score >= 50) return "fair, with clear opportunities to improve";
  return "in need of attention";
}

/**
 * Deterministic, template-based plain-English executive summary. This is the
 * fallback used when the optional AI layer is disabled (the default) or
 * unavailable, and is itself written to read naturally — the AI layer, when
 * enabled, rewrites this same input rather than inventing new claims.
 */
export function buildExecutiveSummary(input: { siteLabel: string; audit: Audit; findings: Finding[] }): string {
  const { siteLabel, audit, findings } = input;
  const open = findings.filter((f) => f.status === "open");
  const critical = open.filter((f) => f.severity === "critical").length;
  const high = open.filter((f) => f.severity === "high").length;
  const fixes = topFixes(open, 3);

  const categoryScores: Array<[string, number | null]> = [
    ["performance", audit.performanceScore],
    ["SEO", audit.seoScore],
    ["accessibility", audit.accessibilityScore],
    ["security", audit.securityScore],
  ];
  const weakest = categoryScores
    .filter(([, s]) => s != null)
    .sort((a, b) => (a[1] as number) - (b[1] as number))[0];

  const parts: string[] = [];
  parts.push(
    `${siteLabel} scored ${audit.overallScore != null ? Math.round(audit.overallScore) : "—"}/100 overall, which is ${scoreWord(audit.overallScore)}.`,
  );

  if (critical > 0 || high > 0) {
    parts.push(
      `This audit found ${critical > 0 ? `${critical} critical issue${critical === 1 ? "" : "s"}` : ""}${critical > 0 && high > 0 ? " and " : ""}${high > 0 ? `${high} high-priority issue${high === 1 ? "" : "s"}` : ""} that are worth addressing soon.`,
    );
  } else {
    parts.push("No critical or high-priority issues were found, which is a strong result.");
  }

  if (weakest) {
    parts.push(`The area with the most room to improve right now is ${weakest[0]}.`);
  }

  if (fixes.length > 0) {
    parts.push(
      `The highest-value next steps are: ${fixes.map((f) => f.title.toLowerCase()).join("; ")}. See "Top fixes" below for details on each.`,
    );
  }

  parts.push(
    "This report blends automated measurements (performance labs, accessibility rule engines, security header/TLS checks, and SEO heuristics) with plain-English explanations of why each finding matters for the business. It is not a substitute for a human review of design, copy, or legal/compliance questions.",
  );

  return parts.join(" ");
}

export function buildNextSteps(findings: Finding[]): string[] {
  const open = findings.filter((f) => f.status === "open");
  const wins = quickWins(open, 3);
  const steps = [
    "Fix the quick wins below first — they're low effort and meaningfully move the needle.",
    ...wins.map((w) => `${w.title} (affects ${w.affectedPageIds.length} page${w.affectedPageIds.length === 1 ? "" : "s"})`),
    "Re-run this audit after making changes to confirm scores improved and nothing regressed.",
    "Schedule recurring audits (weekly or monthly) so regressions and expiring certificates are caught automatically.",
  ];
  return steps;
}
