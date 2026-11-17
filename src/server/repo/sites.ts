import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { sites, projects, audits, permissionConfirmations } from "../db/schema";

export async function createSite(input: {
  projectId: string;
  baseUrl: string;
  label: string;
  isCompetitor?: boolean;
  competitorOfSiteId?: string;
  isLocalBusiness?: boolean;
}) {
  const id = randomUUID();
  await db.insert(sites).values({
    id,
    projectId: input.projectId,
    baseUrl: input.baseUrl,
    label: input.label,
    isCompetitor: input.isCompetitor ?? false,
    competitorOfSiteId: input.competitorOfSiteId ?? null,
    isLocalBusiness: input.isLocalBusiness ?? false,
  });
  return id;
}

export async function getSite(id: string) {
  const [site] = await db.select().from(sites).where(eq(sites.id, id));
  return site ?? null;
}

export async function listAllSitesWithLatestAudit() {
  const allSites = await db.select().from(sites).orderBy(desc(sites.createdAt));
  const allProjects = await db.select().from(projects);
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  const results = [];
  for (const site of allSites) {
    const [latest] = await db
      .select()
      .from(audits)
      .where(eq(audits.siteId, site.id))
      .orderBy(desc(audits.startedAt))
      .limit(1);
    results.push({ site, project: projectById.get(site.projectId) ?? null, latestAudit: latest ?? null });
  }
  return results;
}

export async function recordPermissionConfirmation(input: { siteId: string; confirmedBy: string; statement: string }) {
  const id = randomUUID();
  await db.insert(permissionConfirmations).values({
    id,
    siteId: input.siteId,
    confirmedBy: input.confirmedBy,
    statement: input.statement,
  });
  return id;
}
