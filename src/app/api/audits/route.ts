import { NextResponse } from "next/server";
import { z } from "zod";
import { startAuditJob } from "@/server/jobs/auditJobs";
import { getSite } from "@/server/repo/sites";
import { CRAWL_DEFAULTS } from "@/server/config/thresholds";

const StartAuditSchema = z.object({
  siteId: z.string().min(1),
  permissionConfirmationId: z.string().min(1),
  pages: z.array(z.object({
    url: z.string().url(),
    pageType: z.enum(["home", "listing", "detail", "form", "contact", "content", "other"]),
  })).min(1).max(50),
  lighthouseRuns: z.number().int().min(1).max(5).optional(),
  devices: z.array(z.enum(["mobile", "desktop"])).min(1).optional(),
  checkExposedFiles: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = StartAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const site = await getSite(parsed.data.siteId);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { jobKey } = startAuditJob({
    siteId: site.id,
    baseUrl: site.baseUrl,
    isLocalBusiness: site.isLocalBusiness,
    permissionConfirmationId: parsed.data.permissionConfirmationId,
    pages: parsed.data.pages,
    config: {
      maxPages: parsed.data.pages.length,
      lighthouseRuns: parsed.data.lighthouseRuns ?? CRAWL_DEFAULTS.lighthouseRuns,
      devices: parsed.data.devices ?? [...CRAWL_DEFAULTS.devices],
      concurrency: 1,
      checkExposedFiles: parsed.data.checkExposedFiles ?? false,
    },
  });

  return NextResponse.json({ jobKey }, { status: 202 });
}
