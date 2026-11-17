import cron from "node-cron";
import { lte, eq } from "drizzle-orm";
import { db } from "../db/client";
import { schedules, sites, audits, alerts, auditPages } from "../db/schema";
import { discoverPages } from "../crawler/crawl";
import { recordPermissionConfirmation } from "../repo/sites";
import { startAuditJob } from "./auditJobs";
import { getJobState } from "./auditJobs";
import { CRAWL_DEFAULTS, CERT_EXPIRY_WARNING_DAYS } from "../config/thresholds";

const FREQUENCY_MS: Record<"weekly" | "monthly", number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

async function waitForJob(jobKey: string, timeoutMs: number): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getJobState(jobKey);
    if (!state) return null;
    if (state.status === "done") {
      const doneLine = state.messages.find((m) => m.startsWith("DONE:"));
      return doneLine ? doneLine.slice(5) : null;
    }
    if (state.status === "failed") return null;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

export async function runDueSchedules() {
  const now = new Date().toISOString();
  const due = await db.select().from(schedules).where(lte(schedules.nextRunAt, now));

  for (const schedule of due) {
    if (!schedule.active) continue;
    const [site] = await db.select().from(sites).where(eq(sites.id, schedule.siteId));
    if (!site) continue;

    try {
      const confirmationId = await recordPermissionConfirmation({
        siteId: site.id,
        confirmedBy: "scheduled-audit",
        statement: `Scheduled re-audit of ${site.baseUrl}, relying on the permission confirmed when this schedule was created.`,
      });

      const discovery = await discoverPages(site.baseUrl, CRAWL_DEFAULTS.maxPages);
      const targets = discovery.pages.filter((p) => p.loadOk).map((p) => ({ url: p.url, pageType: p.pageType }));
      if (targets.length === 0) continue;

      const { jobKey } = startAuditJob({
        siteId: site.id,
        baseUrl: site.baseUrl,
        isLocalBusiness: site.isLocalBusiness,
        permissionConfirmationId: confirmationId,
        pages: targets,
        config: {
          maxPages: targets.length,
          lighthouseRuns: CRAWL_DEFAULTS.lighthouseRuns,
          devices: [...CRAWL_DEFAULTS.devices],
          concurrency: 1,
          checkExposedFiles: false,
        },
      });

      const auditId = await waitForJob(jobKey, 20 * 60 * 1000);

      if (auditId) {
        const [newAudit] = await db.select().from(audits).where(eq(audits.id, auditId));
        const previous = await db
          .select()
          .from(audits)
          .where(eq(audits.siteId, site.id));
        const previousDone = previous
          .filter((a) => a.status === "done" && a.id !== auditId)
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];

        if (newAudit && previousDone && newAudit.overallScore != null && previousDone.overallScore != null) {
          const drop = previousDone.overallScore - newAudit.overallScore;
          if (drop >= schedule.alertOnScoreDropPoints) {
            await db.insert(alerts).values({
              id: `${schedule.id}-${Date.now()}`,
              siteId: site.id,
              auditId,
              severity: "warning",
              message: `Overall score dropped ${drop.toFixed(1)} points (from ${Math.round(previousDone.overallScore)} to ${Math.round(newAudit.overallScore)}) since the last audit.`,
            });
          }
        }

        const pagesWithTls = await db.select().from(auditPages).where(eq(auditPages.auditId, auditId));
        for (const page of pagesWithTls) {
          const days = page.tls?.daysUntilExpiry;
          if (days != null && days <= schedule.alertOnCertExpiryDays) {
            await db.insert(alerts).values({
              id: `${schedule.id}-cert-${Date.now()}`,
              siteId: site.id,
              auditId,
              severity: days < 0 ? "critical" : "warning",
              message: `TLS certificate for ${page.url} ${days < 0 ? "has expired" : `expires in ${days} day(s)`}.`,
            });
            break;
          }
        }
      }
    } catch {
      // A single schedule failing shouldn't stop the others from running.
    } finally {
      const nextRunAt = new Date(Date.now() + FREQUENCY_MS[schedule.frequency]).toISOString();
      await db.update(schedules).set({ lastRunAt: now, nextRunAt }).where(eq(schedules.id, schedule.id));
    }
  }
}

let started = false;

/** Started once from instrumentation.ts. Checks every hour for schedules whose nextRunAt has passed. */
export function startScheduler() {
  if (started) return;
  started = true;
  cron.schedule("0 * * * *", () => {
    runDueSchedules().catch(() => {});
  });
}
