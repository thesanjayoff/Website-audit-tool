import { NextResponse } from "next/server";
import { z } from "zod";
import { createSite, listAllSitesWithLatestAudit } from "@/server/repo/sites";
import { assertUrlIsAuditable } from "@/server/security/ssrf";

export async function GET() {
  const results = await listAllSitesWithLatestAudit();
  return NextResponse.json({ sites: results });
}

const CreateSiteSchema = z.object({
  projectId: z.string().min(1),
  baseUrl: z.string().url(),
  label: z.string().min(1).max(200),
  isCompetitor: z.boolean().optional(),
  competitorOfSiteId: z.string().optional(),
  isLocalBusiness: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    await assertUrlIsAuditable(parsed.data.baseUrl);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Blocked URL" }, { status: 400 });
  }
  const id = await createSite(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
