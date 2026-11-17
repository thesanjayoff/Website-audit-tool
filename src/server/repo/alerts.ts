import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { alerts } from "../db/schema";

export async function listUnacknowledgedAlerts() {
  return db.select().from(alerts).where(eq(alerts.acknowledged, false)).orderBy(desc(alerts.createdAt));
}

export async function listAlertsForSite(siteId: string) {
  return db.select().from(alerts).where(eq(alerts.siteId, siteId)).orderBy(desc(alerts.createdAt));
}

export async function acknowledgeAlert(id: string) {
  await db.update(alerts).set({ acknowledged: true }).where(eq(alerts.id, id));
}
