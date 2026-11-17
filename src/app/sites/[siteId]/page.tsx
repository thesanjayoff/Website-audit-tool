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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={14} /> Dashboard</Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{site.label}</h1>
            <p className="text-sm text-[var(--text-muted)]">{site.baseUrl}</p>
          </div>
          <Link href={`/new-audit?siteId=${site.id}`} className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)]">
            <RefreshCw size={14} /> Re-audit
          </Link>
        </div>
      </div>

      {siteAlerts.filter((a) => !a.acknowledged).length > 0 && (
        <div className="card flex flex-col gap-2 border-amber-500/40 p-4">
          <h2 className="font-medium text-amber-600 dark:text-amber-300">Alerts</h2>
          {siteAlerts.filter((a) => !a.acknowledged).map((a) => (
            <p key={a.id} className="text-sm text-[var(--text-muted)]">{a.message}</p>
          ))}
        </div>
      )}

      <section className="card p-6">
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
      </section>

      <section className="card p-6">
        <h2 className="mb-3 font-medium">Trend</h2>
        <TrendChart data={trend} />
      </section>

      <section className="card p-6">
        <h2 className="mb-3 font-medium">Audit history</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--text-muted)]">
            <tr><th className="pb-2">Date</th><th className="pb-2">Status</th><th className="pb-2">Overall</th><th className="pb-2"></th></tr>
          </thead>
          <tbody>
            {auditHistory.map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="py-2">{new Date(a.startedAt).toLocaleString()}</td>
                <td className="py-2"><Badge tone={a.status === "done" ? "fixed" : a.status === "failed" ? "high" : "open"}>{a.status}</Badge></td>
                <td className="py-2">{a.overallScore != null ? Math.round(a.overallScore) : "—"}</td>
                <td className="py-2 text-right"><Link href={`/audits/${a.id}`} className="text-[var(--accent)] hover:underline">View report</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-6">
        <h2 className="mb-3 font-medium">Scheduled re-audits</h2>
        <ScheduleManager siteId={site.id} initialSchedules={siteSchedules} />
      </section>

      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium"><Users size={16} /> Competitor comparison</h2>
          <Link href={`/new-audit?competitorOf=${site.id}`} className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline">
            <Plus size={14} /> Add competitor
          </Link>
        </div>
        {competitorLatest.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Add up to 3 competitor sites to compare scores side by side.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--text-muted)]">
              <tr><th className="pb-2">Site</th><th className="pb-2">Overall</th><th className="pb-2">Perf</th><th className="pb-2">SEO</th><th className="pb-2">A11y</th><th className="pb-2">Security</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--border)] font-medium">
                <td className="py-2">{site.label} (you)</td>
                <td className="py-2">{latestMain?.overallScore != null ? Math.round(latestMain.overallScore) : "—"}</td>
                <td className="py-2">{latestMain?.performanceScore != null ? Math.round(latestMain.performanceScore) : "—"}</td>
                <td className="py-2">{latestMain?.seoScore != null ? Math.round(latestMain.seoScore) : "—"}</td>
                <td className="py-2">{latestMain?.accessibilityScore != null ? Math.round(latestMain.accessibilityScore) : "—"}</td>
                <td className="py-2">{latestMain?.securityScore != null ? Math.round(latestMain.securityScore) : "—"}</td>
              </tr>
              {competitorLatest.map(({ site: c, latestAudit }) => (
                <tr key={c.id} className="border-t border-[var(--border)]">
                  <td className="py-2">{c.label}</td>
                  <td className="py-2">{latestAudit?.overallScore != null ? Math.round(latestAudit.overallScore) : "—"}</td>
                  <td className="py-2">{latestAudit?.performanceScore != null ? Math.round(latestAudit.performanceScore) : "—"}</td>
                  <td className="py-2">{latestAudit?.seoScore != null ? Math.round(latestAudit.seoScore) : "—"}</td>
                  <td className="py-2">{latestAudit?.accessibilityScore != null ? Math.round(latestAudit.accessibilityScore) : "—"}</td>
                  <td className="py-2">{latestAudit?.securityScore != null ? Math.round(latestAudit.securityScore) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
