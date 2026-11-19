import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Plus, RefreshCw, Users } from "lucide-react";
import { getSite } from "@/server/repo/sites";
import { listAuditsForSite } from "@/server/repo/audits";
import { listAlertsForSite } from "@/server/repo/alerts";
import { db } from "@/server/db/client";
import { schedules, sites } from "@/server/db/schema";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { ScheduleManager } from "@/components/ScheduleManager";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!site) notFound();

  const [auditHistory, siteSchedules, siteAlerts, competitors] = await Promise.all([
    listAuditsForSite(siteId),
    db.select().from(schedules).where(eq(schedules.siteId, siteId)),
    listAlertsForSite(siteId),
    db.select().from(sites).where(eq(sites.competitorOfSiteId, siteId)),
  ]);

  const doneAudits = auditHistory.filter((a) => a.status === "done").slice().reverse();
  const trend: TrendPoint[] = doneAudits.map((a) => ({
    date: new Date(a.startedAt).toLocaleDateString(),
    overall: a.overallScore,
    performance: a.performanceScore,
    seo: a.seoScore,
    accessibility: a.accessibilityScore,
    security: a.securityScore,
  }));

  const competitorLatest = await Promise.all(
    competitors.map(async (c) => {
      const [latest] = await listAuditsForSite(c.id);
      return { site: c, latestAudit: latest ?? null };
    }),
  );
  const [latestMain] = auditHistory;

  const unacknowledgedAlerts = siteAlerts.filter((a) => !a.acknowledged);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={14} /> Dashboard</Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{site.label}</h1>
            <p className="text-sm text-[var(--text-muted)]">{site.baseUrl}</p>
          </div>
          <Button render={<Link href={`/new-audit?siteId=${site.id}`} />}>
            <RefreshCw size={14} /> Re-audit
          </Button>
        </div>
      </div>

      {unacknowledgedAlerts.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTitle>Alerts</AlertTitle>
          <AlertDescription className="flex flex-col gap-1 text-current">
            {unacknowledgedAlerts.map((a) => (
              <span key={a.id}>{a.message}</span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <h2 className="mb-3 font-medium">Latest scores</h2>
        {latestMain ? (
          <div className="flex flex-wrap gap-6">
            <ScoreRing score={latestMain.overallScore} label="Overall" size={100} />
            <ScoreRing score={latestMain.performanceScore} label="Performance" />
            <ScoreRing score={latestMain.seoScore} label="SEO" />
            <ScoreRing score={latestMain.accessibilityScore} label="Accessibility" />
            <ScoreRing score={latestMain.securityScore} label="Security" />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No completed audits yet.</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 font-medium">Trend</h2>
        <TrendChart data={trend} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 font-medium">Audit history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Overall</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditHistory.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{new Date(a.startedAt).toLocaleString()}</TableCell>
                <TableCell><Badge tone={a.status === "done" ? "fixed" : a.status === "failed" ? "high" : "open"}>{a.status}</Badge></TableCell>
                <TableCell>{a.overallScore != null ? Math.round(a.overallScore) : "—"}</TableCell>
                <TableCell className="text-right"><Link href={`/audits/${a.id}`} className="text-[var(--accent)] hover:underline">View report</Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 font-medium">Scheduled re-audits</h2>
        <ScheduleManager siteId={site.id} initialSchedules={siteSchedules} />
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium"><Users size={16} /> Competitor comparison</h2>
          <Button variant="link" size="sm" className="h-auto p-0" render={<Link href={`/new-audit?competitorOf=${site.id}`} />}>
            <Plus size={14} /> Add competitor
          </Button>
        </div>
        {competitorLatest.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Add up to 3 competitor sites to compare scores side by side.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Perf</TableHead>
                <TableHead>SEO</TableHead>
                <TableHead>A11y</TableHead>
                <TableHead>Security</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="font-medium">
                <TableCell>{site.label} (you)</TableCell>
                <TableCell>{latestMain?.overallScore != null ? Math.round(latestMain.overallScore) : "—"}</TableCell>
                <TableCell>{latestMain?.performanceScore != null ? Math.round(latestMain.performanceScore) : "—"}</TableCell>
                <TableCell>{latestMain?.seoScore != null ? Math.round(latestMain.seoScore) : "—"}</TableCell>
                <TableCell>{latestMain?.accessibilityScore != null ? Math.round(latestMain.accessibilityScore) : "—"}</TableCell>
                <TableCell>{latestMain?.securityScore != null ? Math.round(latestMain.securityScore) : "—"}</TableCell>
              </TableRow>
              {competitorLatest.map(({ site: c, latestAudit }) => (
                <TableRow key={c.id}>
                  <TableCell>{c.label}</TableCell>
                  <TableCell>{latestAudit?.overallScore != null ? Math.round(latestAudit.overallScore) : "—"}</TableCell>
                  <TableCell>{latestAudit?.performanceScore != null ? Math.round(latestAudit.performanceScore) : "—"}</TableCell>
                  <TableCell>{latestAudit?.seoScore != null ? Math.round(latestAudit.seoScore) : "—"}</TableCell>
                  <TableCell>{latestAudit?.accessibilityScore != null ? Math.round(latestAudit.accessibilityScore) : "—"}</TableCell>
                  <TableCell>{latestAudit?.securityScore != null ? Math.round(latestAudit.securityScore) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
