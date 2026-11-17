import { NextResponse } from "next/server";
import { getSite } from "@/server/repo/sites";
import { listAuditsForSite } from "@/server/repo/audits";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const auditsForSite = await listAuditsForSite(siteId);
  return NextResponse.json({ site, audits: auditsForSite });
}
