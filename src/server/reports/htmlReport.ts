import { escapeHtml, truncate } from "./escape";
import type { ReportData } from "./buildReportData";
import { rateMetric } from "../config/thresholds";

type Finding = ReportData["findings"][number];
type AuditPage = ReportData["pages"][number];

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#991b1b",
  high: "#dc2626",
  medium: "#d97706",
  low: "#2563eb",
  info: "#6b7280",
};

function scoreColor(score: number | null): string {
  if (score == null) return "#6b7280";
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#d97706";
  return "#dc2626";
}

function renderScoreCard(label: string, score: number | null): string {
  return `
    <div class="score-card">
      <div class="score-value" style="color:${scoreColor(score)}">${score != null ? Math.round(score) : "—"}</div>
      <div class="score-label">${escapeHtml(label)}</div>
    </div>`;
}

function renderFinding(f: Finding): string {
  const color = SEVERITY_COLOR[f.severity] ?? "#6b7280";
  const evidence = f.evidence
    .slice(0, 5)
    .map(
      (e) => `
      <li>
        <code>${escapeHtml(e.pageUrl)}</code>
        ${e.selector ? `<br/><span class="muted">selector: <code>${escapeHtml(e.selector)}</code></span>` : ""}
        ${e.snippet ? `<pre class="snippet">${escapeHtml(truncate(e.snippet, 400))}</pre>` : ""}
        ${e.value ? `<br/><span class="muted">${escapeHtml(e.value)}</span>` : ""}
      </li>`,
    )
    .join("");

  return `
    <div class="finding">
      <div class="finding-header">
        <span class="pill" style="background:${color}1a;color:${color};border-color:${color}55">${escapeHtml(f.severity)}</span>
        <h4>${escapeHtml(f.title)}</h4>
        <span class="muted">affects ${f.affectedPageIds.length} page${f.affectedPageIds.length === 1 ? "" : "s"}</span>
      </div>
      <p>${escapeHtml(f.explanation)}</p>
      <p class="impact"><strong>Why it matters:</strong> ${escapeHtml(f.businessImpact)}</p>
      <p class="fix"><strong>Suggested fix:</strong> ${escapeHtml(f.fixSuggestion)}</p>
      <p class="muted">Effort: ${escapeHtml(f.effort)} · Impact: ${escapeHtml(f.impact)} · Engine: ${escapeHtml(f.engine)}${(f.wcagCriteria ?? []).length ? ` · WCAG: ${(f.wcagCriteria ?? []).map(escapeHtml).join(", ")}` : ""}</p>
      ${evidence ? `<ul class="evidence">${evidence}</ul>` : ""}
    </div>`;
}

function renderPageRow(p: AuditPage): string {
  const lab = p.metrics?.lab;
  const lcpRating = lab ? rateMetric(lab.lcpMs, { good: 2500, poor: 4000 }) : "unknown";
  return `
    <tr>
      <td>${escapeHtml(p.url)}</td>
      <td>${escapeHtml(p.pageType)}</td>
      <td>${escapeHtml(p.device)}</td>
      <td>${p.loadOk ? "OK" : `<span style="color:#dc2626">${escapeHtml(p.loadError ?? "failed")}</span>`}</td>
      <td>${lab?.lighthousePerformanceScore != null ? Math.round(lab.lighthousePerformanceScore) : "—"}</td>
      <td>${lab?.lcpMs != null ? `${Math.round(lab.lcpMs)}ms (${lcpRating})` : "—"}</td>
      <td>${lab?.clsScore != null ? lab.clsScore.toFixed(3) : "—"}</td>
      <td>${lab?.tbtMs != null ? `${Math.round(lab.tbtMs)}ms` : "—"}</td>
    </tr>`;
}

export function renderStandaloneHtmlReport(data: ReportData): string {
  const { site, audit, pages, findings, branding, executiveSummary, nextSteps, topFixes, quickWins, groupedFindings, scoreDeltas, findingsDiff, methodology } = data;

  const categorySections = (["performance", "seo", "accessibility", "security", "content"] as const)
    .map((cat) => {
      const items = groupedFindings[cat];
      if (items.length === 0) return "";
      return `<section class="category"><h3>${escapeHtml(cat)} (${items.length})</h3>${items.map(renderFinding).join("")}</section>`;
    })
    .join("");

  const deltaRows = scoreDeltas
    .map(
      (d) => `<tr><td>${escapeHtml(d.category)}</td><td>${d.previous != null ? Math.round(d.previous) : "—"}</td><td>${d.current != null ? Math.round(d.current) : "—"}</td><td style="color:${d.delta == null ? "#6b7280" : d.delta >= 0 ? "#16a34a" : "#dc2626"}">${d.delta == null ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta}`}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(site.label)} — Website Audit Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --accent: ${escapeHtml(branding.primaryColor)}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #171923; background: #fff; line-height: 1.5; }
  .page { max-width: 880px; margin: 0 auto; padding: 32px 24px 80px; }
  .cover { border-bottom: 4px solid var(--accent); padding-bottom: 24px; margin-bottom: 32px; }
  .cover .brand { color: var(--accent); font-weight: 700; font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; }
  .cover h1 { font-size: 28px; margin: 8px 0 4px; }
  .cover .meta { color: #5b6475; font-size: 14px; }
  h2 { border-bottom: 1px solid #e4e7ee; padding-bottom: 8px; margin-top: 40px; }
  h3 { text-transform: capitalize; }
  .scores { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
  .score-card { border: 1px solid #e4e7ee; border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 110px; }
  .score-value { font-size: 32px; font-weight: 700; }
  .score-label { color: #5b6475; font-size: 13px; margin-top: 4px; text-transform: capitalize; }
  .finding { border: 1px solid #e4e7ee; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
  .finding-header { display: flex; align-items: center; gap: 10px; }
  .finding-header h4 { margin: 0; flex: 1; font-size: 15px; }
  .pill { border: 1px solid; border-radius: 999px; padding: 2px 10px; font-size: 11px; text-transform: uppercase; font-weight: 600; }
  .muted { color: #5b6475; font-size: 13px; }
  .impact { background: #fafafa; padding: 8px 10px; border-radius: 6px; }
  .fix { background: #f0f5ff; padding: 8px 10px; border-radius: 6px; }
  .evidence { font-size: 13px; padding-left: 18px; }
  .snippet { background: #f6f7fb; border: 1px solid #e4e7ee; padding: 6px 8px; border-radius: 6px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
  th, td { border-bottom: 1px solid #e4e7ee; padding: 6px 8px; text-align: left; }
  .ai-label { display: inline-block; margin-top: 8px; font-size: 11px; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 2px 8px; }
  ul.simple { padding-left: 20px; }
  .disclaimer { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin: 16px 0; }
  @media print { .page { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div class="brand">${escapeHtml(branding.agencyName)}</div>
    <h1>${escapeHtml(site.label)} — Website Audit Report</h1>
    <div class="meta">${escapeHtml(site.baseUrl)} · Audited ${escapeHtml(new Date(audit.startedAt).toLocaleDateString())} · Report generated ${escapeHtml(new Date().toLocaleDateString())}</div>
  </div>

  <h2>Executive summary</h2>
  <p>${escapeHtml(executiveSummary.text)}</p>
  ${executiveSummary.aiGenerated ? '<span class="ai-label">AI-assisted wording — editable</span>' : ""}

  <div class="scores">
    ${renderScoreCard("Overall", audit.overallScore)}
    ${renderScoreCard("Performance", audit.performanceScore)}
    ${renderScoreCard("SEO", audit.seoScore)}
    ${renderScoreCard("Accessibility", audit.accessibilityScore)}
    ${renderScoreCard("Security", audit.securityScore)}
  </div>

  ${data.previousAudit ? `
  <h2>Since the last audit</h2>
  <table>
    <thead><tr><th>Category</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead>
    <tbody>${deltaRows}</tbody>
  </table>
  <p class="muted">${findingsDiff.newFindings.length} new finding(s), ${findingsDiff.resolvedFindings.length} resolved, ${findingsDiff.persistingFindings.length} still open from before.</p>
  ` : ""}

  <h2>Top 5 fixes</h2>
  <p class="muted">Sorted by impact vs. effort — the best return on time spent.</p>
  ${topFixes.map(renderFinding).join("") || "<p>No open findings — nice work.</p>"}

  <h2>Quick wins</h2>
  <p class="muted">Low effort, meaningful impact.</p>
  <ul class="simple">${quickWins.map((f) => `<li>${escapeHtml(f.title)} <span class="muted">(${f.affectedPageIds.length} page${f.affectedPageIds.length === 1 ? "" : "s"})</span></li>`).join("") || "<li>None identified this round.</li>"}</ul>

  <h2>Next steps</h2>
  <ul class="simple">${nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

  <h2>Technical appendix</h2>
  <p class="muted">Every finding, grouped by category, with evidence and a suggested fix.</p>
  ${categorySections}

  <h2>Pages audited</h2>
  <table>
    <thead><tr><th>URL</th><th>Type</th><th>Device</th><th>Loaded</th><th>Perf</th><th>LCP</th><th>CLS</th><th>TBT (INP proxy)</th></tr></thead>
    <tbody>${pages.map(renderPageRow).join("")}</tbody>
  </table>

  <h2>Methodology &amp; limitations</h2>
  <div class="disclaimer">
    <strong>This is not a penetration test, a full vulnerability assessment, or an accessibility compliance certification.</strong>
    It combines automated lab measurements and rule-based checks with plain-English explanations. Automated accessibility tools
    only catch roughly 30-50% of real WCAG issues — see the manual checklist below.
  </div>
  <ul class="simple">
    <li>Lighthouse ${escapeHtml(methodology.lighthouseVersion ?? "unknown")} — performance/SEO/best-practices lab scores, median of multiple runs per page.</li>
    <li>axe-core ${escapeHtml(methodology.axeCoreVersion ?? "unknown")} and HTML CodeSniffer via Pa11y ${escapeHtml(methodology.pa11yVersion ?? "unknown")} — automated WCAG 2.0/2.1/2.2 A/AA checks.</li>
    <li>Core Web Vitals lab thresholds: LCP good ≤ ${methodology.cwvThresholds.lcpMs.good}ms, CLS good ≤ ${methodology.cwvThresholds.cls.good}, INP good ≤ ${methodology.cwvThresholds.inpMs.good}ms (Lighthouse cannot measure INP directly in the lab; Total Blocking Time is shown as a labelled proxy).</li>
    <li>Overall score = weighted average of Performance (${Math.round(methodology.categoryWeights.performance * 100)}%), SEO (${Math.round(methodology.categoryWeights.seo * 100)}%), Accessibility (${Math.round(methodology.categoryWeights.accessibility * 100)}%), Security (${Math.round(methodology.categoryWeights.security * 100)}%). Full formula and weights are documented in the tool's source (src/server/config/scoring.ts) and are adjustable.</li>
    <li>${escapeHtml(methodology.accessibilityNote)}</li>
    <li>${escapeHtml(methodology.aiNote)}</li>
  </ul>
  <h3>Manual accessibility checklist (not automatable)</h3>
  <ul class="simple">${methodology.manualAccessibilityChecklist.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>

  <p class="muted">Findings referenced in this report: ${findings.length} total (${findings.filter((f) => f.status === "open").length} open).</p>
</div>
</body>
</html>`;
}
