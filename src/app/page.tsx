import Link from "next/link";
import { Plus, Globe, Building2 } from "lucide-react";
import { listAllSitesWithLatestAudit } from "@/server/repo/sites";
import { listProjects } from "@/server/repo/projects";
import { listUnacknowledgedAlerts } from "@/server/repo/alerts";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { AlertsBanner } from "@/components/AlertsBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sitesWithAudits, projects, alerts] = await Promise.all([listAllSitesWithLatestAudit(), listProjects(), listUnacknowledgedAlerts()]);
  const clientSites = sitesWithAudits.filter((s) => !s.site.isCompetitor);

  return (
    <div className="flex flex-col gap-8">
      <AlertsBanner alerts={alerts} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {projects.length} project{projects.length === 1 ? "" : "s"} · {clientSites.length} site{clientSites.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button render={<Link href="/new-audit" />}>
          <Plus size={16} /> New audit
        </Button>
      </div>

      {clientSites.length === 0 ? (
        <Card className="items-center gap-3 p-12 text-center text-[var(--text-muted)]">
          <Globe size={32} className="mx-auto" />
          <p>No sites yet. Start your first audit to see it here.</p>
          <Link href="/new-audit" className="text-[var(--accent)] underline">
            Run a new audit
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientSites.map(({ site, project, latestAudit }) => (
            <Link key={site.id} href={`/sites/${site.id}`}>
              <Card className="h-full p-5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Building2 size={12} /> {project?.name ?? "Unassigned"}
                    </div>
                    <h2 className="font-medium">{site.label}</h2>
                    <p className="truncate text-xs text-[var(--text-muted)]">{site.baseUrl}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  {latestAudit ? (
                    <>
                      <ScoreRing score={latestAudit.overallScore} label="Overall" size={64} />
                      <Badge tone={latestAudit.status === "done" ? "fixed" : latestAudit.status === "failed" ? "high" : "open"}>
                        {latestAudit.status}
                      </Badge>
                    </>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">No audits yet</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
