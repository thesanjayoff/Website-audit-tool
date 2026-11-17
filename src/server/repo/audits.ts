import { desc, eq, and, ne } from "drizzle-orm";
import { db } from "../db/client";
import { audits, auditPages, findings, sites } from "../db/schema";

export async function listAuditsForSite(siteId: string) {
  return db.select().from(audits).where(eq(audits.siteId, siteId)).orderBy(desc(audits.startedAt));
}

export async function getAuditDetail(auditId: string) {
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
  if (!audit) return null;
  const [site] = await db.select().from(sites).where(eq(sites.id, audit.siteId));
  const pages = await db.select().from(auditPages).where(eq(auditPages.auditId, auditId));
  const auditFindings = await db.select().from(findings).where(eq(findings.auditId, auditId));
  return { audit, site: site ?? null, pages, findings: auditFindings };
}

export async function getPreviousDoneAudit(siteId: string, beforeAuditId: string) {
  const [before] = await db.select().from(audits).where(eq(audits.id, beforeAuditId));
  if (!before) return null;
  const candidates = await db
    .select()
    .from(audits)
    .where(and(eq(audits.siteId, siteId), eq(audits.status, "done"), ne(audits.id, beforeAuditId)))
    .orderBy(desc(audits.startedAt));
  return candidates.find((a) => a.startedAt < before.startedAt) ?? null;
}

export async function updateFindingStatus(findingId: string, status?: "open" | "fixed" | "ignored", note?: string) {
  const patch: Partial<{ status: "open" | "fixed" | "ignored"; note: string }> = {};
  if (status !== undefined) patch.status = status;
  if (note !== undefined) patch.note = note;
  if (Object.keys(patch).length === 0) return;
  await db.update(findings).set(patch).where(eq(findings.id, findingId));
}
