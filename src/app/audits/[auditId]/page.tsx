import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, FileSpreadsheet, FileJson, FileCode, ArrowLeft, ChevronDown, TriangleAlert } from "lucide-react";
import { buildReportData } from "@/server/reports/buildReportData";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { FindingCard } from "@/components/FindingCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const EXPORT_FORMATS = [
  { format: "html", label: "HTML report", icon: <FileText size={14} /> },
  { format: "pdf", label: "PDF", icon: <Download size={14} /> },
  { format: "csv", label: "CSV", icon: <FileSpreadsheet size={14} /> },
  { format: "json", label: "JSON", icon: <FileJson size={14} /> },
  { format: "markdown", label: "Markdown", icon: <FileCode size={14} /> },
] as const;

export default async function AuditDetailPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const data = await buildReportData(auditId);
  if (!data) notFound();

  const { site, audit, pages, executiveSummary, topFixes, quickWins, groupedFindings, scoreDeltas, findingsDiff, methodology } = data;

  if (audit.status !== "done") {
    return (
      <Card className="p-8 text-center">
        <p className="text-lg font-medium capitalize">Audit is {audit.status}</p>
        {audit.error && <p className="mt-2 text-sm text-[var(--bad)]">{audit.error}</p>}
      </Card>
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
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <Download size={14} /> Export <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {EXPORT_FORMATS.map((f) => (
              <DropdownMenuItem
                key={f.format}
                render={<a href={`/api/audits/${auditId}/export?format=${f.format}`} />}
              >
                {f.icon} {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="p-6">
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
      </Card>

      {data.previousAudit && (
        <Card className="p-6">
          <h2 className="mb-3 font-medium">Since the last audit</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Previous</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scoreDeltas.map((d) => (
                <TableRow key={d.category}>
                  <TableCell className="capitalize">{d.category}</TableCell>
                  <TableCell>{d.previous != null ? Math.round(d.previous) : "—"}</TableCell>
                  <TableCell>{d.current != null ? Math.round(d.current) : "—"}</TableCell>
                  <TableCell className={d.delta != null && d.delta < 0 ? "text-[var(--bad)]" : "text-[var(--good)]"}>
                    {d.delta == null ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {findingsDiff.newFindings.length} new · {findingsDiff.resolvedFindings.length} resolved · {findingsDiff.persistingFindings.length} still open
          </p>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Top 5 fixes</h2>
        <div className="flex flex-col gap-3">
          {topFixes.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No open findings — nice work.</p> : topFixes.map((f) => <FindingCard key={f.id} finding={f} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Quick wins</h2>
        <Card>
          <CardContent className="flex flex-col gap-2">
            {quickWins.length === 0 ? <p className="text-sm text-[var(--text-muted)]">None identified this round.</p> : quickWins.map((f) => (
              <div key={f.id} className="flex items-center justify-between border-b border-[var(--border)] pb-2 text-sm last:border-b-0 last:pb-0">
                <span>{f.title}</span>
                <span className="text-xs text-[var(--text-muted)]">{f.affectedPageIds.length} page(s)</span>
              </div>
            ))}
          </CardContent>
        </Card>
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
        <Card className="scrollbar-thin overflow-x-auto p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Loaded</TableHead>
                <TableHead>Perf</TableHead>
                <TableHead>LCP</TableHead>
                <TableHead>CLS</TableHead>
                <TableHead>TBT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[260px] truncate"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a></TableCell>
                  <TableCell className="capitalize">{p.pageType}</TableCell>
                  <TableCell className="capitalize">{p.device}</TableCell>
                  <TableCell>{p.loadOk ? <span className="text-[var(--good)]">OK</span> : <span className="text-[var(--bad)]">{p.loadError}</span>}</TableCell>
                  <TableCell>{p.metrics?.lab.lighthousePerformanceScore != null ? Math.round(p.metrics.lab.lighthousePerformanceScore) : "—"}</TableCell>
                  <TableCell>{p.metrics?.lab.lcpMs != null ? `${Math.round(p.metrics.lab.lcpMs)}ms` : "—"}</TableCell>
                  <TableCell>{p.metrics?.lab.clsScore != null ? p.metrics.lab.clsScore.toFixed(3) : "—"}</TableCell>
                  <TableCell>{p.metrics?.lab.tbtMs != null ? `${Math.round(p.metrics.lab.tbtMs)}ms` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <Card className="p-6 text-sm text-[var(--text-muted)]">
        <h2 className="mb-2 font-medium text-[var(--text)]">Methodology &amp; limitations</h2>
        <Alert variant="destructive" className="mb-2">
          <TriangleAlert />
          <AlertDescription className="text-current">
            This is not a penetration test, a full vulnerability assessment, or an accessibility compliance certification.
          </AlertDescription>
        </Alert>
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
      </Card>
    </div>
  );
}
