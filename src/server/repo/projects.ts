import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { projects, sites } from "../db/schema";

export async function createProject(input: { name: string; tags?: string[]; notes?: string }) {
  const id = randomUUID();
  await db.insert(projects).values({ id, name: input.name, tags: input.tags ?? [], notes: input.notes ?? null });
  return id;
}

export async function listProjects() {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProject(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;
  const projectSites = await db.select().from(sites).where(eq(sites.projectId, id));
  return { ...project, sites: projectSites };
}
