import { listProjects } from "@/server/repo/projects";
import { getSite } from "@/server/repo/sites";
import { NewAuditWizard } from "./NewAuditWizard";
import { Copy } from "@/components/Copy";

export const dynamic = "force-dynamic";

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; competitorOf?: string }>;
}) {
  const { siteId, competitorOf } = await searchParams;
  const projects = await listProjects();
  const existingSite = siteId ? await getSite(siteId) : null;
  const competitorOfSite = competitorOf ? await getSite(competitorOf) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Copy animateOnScroll={false}>
          <h1 className="text-2xl font-semibold">{existingSite ? `Re-audit ${existingSite.label}` : competitorOfSite ? `Add a competitor of ${competitorOfSite.label}` : "New audit"}</h1>
        </Copy>
        <p className="text-sm text-[var(--text-muted)]">Crawl, audit, and score a site you have permission to test.</p>
      </div>
      <NewAuditWizard
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        existingSite={existingSite ? { id: existingSite.id, baseUrl: existingSite.baseUrl, label: existingSite.label, projectId: existingSite.projectId } : null}
        competitorOf={competitorOfSite ? { id: competitorOfSite.id, projectId: competitorOfSite.projectId } : null}
      />
    </div>
  );
}
