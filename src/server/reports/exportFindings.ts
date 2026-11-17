import type { findings as findingsTable } from "../db/schema";

type Finding = typeof findingsTable.$inferSelect;

function csvCell(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function findingsToCsv(findings: Finding[]): string {
  const headers = ["Category", "Severity", "Title", "Explanation", "Business impact", "Effort", "Impact", "Affected pages", "Fix", "Status"];
  const rows = findings.map((f) =>
    [
      f.category,
      f.severity,
      f.title,
      f.explanation,
      f.businessImpact,
      f.effort,
      f.impact,
      f.affectedPageIds.length,
      f.fixSuggestion,
      f.status,
    ].map(csvCell).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function findingsToMarkdown(findings: Finding[], siteLabel: string): string {
  const lines = [`# To-do: ${siteLabel} audit findings`, ""];
  for (const f of findings) {
    lines.push(`## [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push("");
    lines.push(f.explanation);
    lines.push("");
    lines.push(`**Why it matters:** ${f.businessImpact}`);
    lines.push("");
    lines.push(`**Fix:** ${f.fixSuggestion}`);
    lines.push("");
    lines.push(`**Effort:** ${f.effort} · **Impact:** ${f.impact} · **Affects:** ${f.affectedPageIds.length} page(s)`);
    lines.push("");
    if (f.evidence.length > 0) {
      lines.push("**Evidence:**");
      for (const e of f.evidence.slice(0, 5)) {
        lines.push(`- ${e.pageUrl}${e.selector ? ` (\`${e.selector}\`)` : ""}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

/** One finding -> one GitHub-issue-shaped text block (title + body), ready to paste into `gh issue create`. */
export function findingToGitHubIssueText(f: Finding): { title: string; body: string } {
  const title = `[${f.severity}] ${f.title}`;
  const body = [
    f.explanation,
    "",
    `**Why it matters:** ${f.businessImpact}`,
    "",
    `**Suggested fix:** ${f.fixSuggestion}`,
    "",
    `**Effort:** ${f.effort} | **Impact:** ${f.impact} | **Affected pages:** ${f.affectedPageIds.length}`,
    "",
    "**Evidence:**",
    ...f.evidence.slice(0, 10).map((e) => `- ${e.pageUrl}${e.selector ? ` — \`${e.selector}\`` : ""}${e.snippet ? `\n  \`\`\`html\n  ${e.snippet.slice(0, 300)}\n  \`\`\`` : ""}`),
  ].join("\n");
  return { title, body };
}
