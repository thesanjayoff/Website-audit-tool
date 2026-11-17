import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, FileSpreadsheet, FileJson, ArrowLeft } from "lucide-react";
import { buildReportData } from "@/server/reports/buildReportData";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { FindingCard } from "@/components/FindingCard";

export const dynamic = "force-dynamic";

export default async function AuditDetailPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const data = await buildReportData(auditId);
  if (!data) notFound();

  const { site, audit, pages, executiveSummary, topFixes, quickWins, groupedFindings, scoreDeltas, findingsDiff, methodology } = data;

  if (audit.status !== "done") {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-medium capitalize">Audit is {audit.status}</p>
        {audit.error && <p className="mt-2 text-sm text-[var(--bad)]">{audit.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/sites/${site.id}`} className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            <ArrowLeft size={14} /> Back to {site.label}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{site.label} — audit report</h1>
          <p className="text-sm text-[var(--text-muted)]">{site.baseUrl} · {new Date(audit.startedAt).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <ExportLink auditId={auditId} format="html" icon={<FileText size={14} />} label="HTML" />
          <ExportLink auditId={auditId} format="pdf" icon={<Download size={14} />} label="PDF" />
          <ExportLink auditId={auditId} format="csv" icon={<FileSpreadsheet size={14} />} label="CSV" />
          <ExportLink auditId={auditId} format="json" icon={<FileJson size={14} />} label="JSON" />
        </div>
      </div>

      <section className="card p-6">
        <h2 className="mb-2 font-medium">Executive summary</h2>
        <p className="text-sm text-[var(--text-muted)]">{executiveSummary.text}</p>
        {executiveSummary.aiGenerated && <Badge tone="low" className="mt-2">AI-assisted wording — editable</Badge>}
        <div className="mt-6 flex flex-wrap gap-6">
          <ScoreRing score={audit.overallScore} label="Overall" size={110} />
          <ScoreRing score={audit.performanceScore} label="Performance" />
          <ScoreRing score={audit.seoScore} label="SEO" />
          <ScoreRing score={audit.accessibilityScore} label="Accessibility" />
          <ScoreRing score={audit.securityScore} label="Security" />
        </div>
      </section>

      {data.previousAudit && (
        <section className="card p-6">
          <h2 className="mb-3 font-medium">Since the last audit</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--text-muted)]">
              <tr><th className="pb-2">Category</th><th className="pb-2">Previous</th><th className="pb-2">Current</th><th className="pb-2">Change</th></tr>
            </thead>
            <tbody>
              {scoreDeltas.map((d) => (
                <tr key={d.category} className="border-t border-[var(--border)]">
                  <td className="py-1.5">{d.category}</td>
                  <td className="py-1.5">{d.previous != null ? Math.round(d.previous) : "—"}</td>
                  <td className="py-1.5">{d.current != null ? Math.round(d.current) : "—"}</td>
                  <td className={`py-1.5 ${d.delta != null && d.delta < 0 ? "text-[var(--bad)]" : "text-[var(--good)]"}`}>
                    {d.delta == null ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {findingsDiff.newFindings.length} new · {findingsDiff.resolvedFindings.length} resolved · {findingsDiff.persistingFindings.length} still open
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Top 5 fixes</h2>
        <div className="flex flex-col gap-3">
          {topFixes.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No open findings — nice work.</p> : topFixes.map((f) => <FindingCard key={f.id} finding={f} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Quick wins</h2>
        <ul className="card flex flex-col gap-2 p-4 text-sm">
          {quickWins.length === 0 ? <li className="text-[var(--text-muted)]">None identified this round.</li> : quickWins.map((f) => (
            <li key={f.id} className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
              <span>{f.title}</span>
              <span className="text-xs text-[var(--text-muted)]">{f.affectedPageIds.length} page(s)</span>
            </li>
          ))}
        </ul>
      </section>

      {(["performance", "seo", "accessibility", "security", "content"] as const).map((cat) => {
        const items = groupedFindings[cat];
        if (items.length === 0) return null;
        return (
          <section key={cat}>
            <h2 className="mb-3 text-lg font-medium capitalize">{cat} ({items.length})</h2>
            <div className="flex flex-col gap-3">
              {items.map((f) => <FindingCard key={f.id} finding={f} />)}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="mb-3 text-lg font-medium">Pages audited</h2>
        <div className="card scrollbar-thin overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--text-muted)]">
              <tr>
                <th className="p-2">URL</th><th className="p-2">Type</th><th className="p-2">Device</th><th className="p-2">Loaded</th>
                <th className="p-2">Perf</th><th className="p-2">LCP</th><th className="p-2">CLS</th><th className="p-2">TBT</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="max-w-[260px] truncate p-2"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a></td>
                  <td className="p-2 capitalize">{p.pageType}</td>
                  <td className="p-2 capitalize">{p.device}</td>
                  <td className="p-2">{p.loadOk ? <span className="text-[var(--good)]">OK</span> : <span className="text-[var(--bad)]">{p.loadError}</span>}</td>
                  <td className="p-2">{p.metrics?.lab.lighthousePerformanceScore != null ? Math.round(p.metrics.lab.lighthousePerformanceScore) : "—"}</td>
                  <td className="p-2">{p.metrics?.lab.lcpMs != null ? `${Math.round(p.metrics.lab.lcpMs)}ms` : "—"}</td>
                  <td className="p-2">{p.metrics?.lab.clsScore != null ? p.metrics.lab.clsScore.toFixed(3) : "—"}</td>
                  <td className="p-2">{p.metrics?.lab.tbtMs != null ? `${Math.round(p.metrics.lab.tbtMs)}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6 text-sm text-[var(--text-muted)]">
        <h2 className="mb-2 font-medium text-[var(--text)]">Methodology &amp; limitations</h2>
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
          This is not a penetration test, a full vulnerability assessment, or an accessibility compliance certification.
        </p>
        <ul className="flex flex-col gap-1.5 pl-4 list-disc">
          <li>Lighthouse {methodology.lighthouseVersion ?? "unknown"} — median of multiple runs per page.</li>
          <li>axe-core {methodology.axeCoreVersion ?? "unknown"} + HTML CodeSniffer via Pa11y {methodology.pa11yVersion ?? "unknown"}.</li>
          <li>{methodology.accessibilityNote}</li>
          <li>{methodology.aiNote}</li>
        </ul>
        <h3 className="mt-4 mb-1 font-medium text-[var(--text)]">Manual accessibility checklist</h3>
        <ul className="flex flex-col gap-1 pl-4 list-disc">
          {methodology.manualAccessibilityChecklist.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>
    </div>
  );
}

function ExportLink({ auditId, format, icon, label }: { auditId: string; format: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={`/api/audits/${auditId}/export?format=${format}`}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {icon} {label}
    </a>
  );
}
