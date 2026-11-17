import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPermissionConfirmation, getSite } from "@/server/repo/sites";

const ConfirmSchema = z.object({
  confirmedBy: z.string().min(1).max(200),
});

/**
 * Records the required "I own this site or have permission to audit it"
 * confirmation. This is mandatory before any crawl/audit of a given site —
 * see the audit log requirement in the product spec.
 */
export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const statement = `I, ${parsed.data.confirmedBy}, confirm that I own ${site.baseUrl} or have explicit permission from its owner to run a passive audit against it.`;
  const id = await recordPermissionConfirmation({ siteId, confirmedBy: parsed.data.confirmedBy, statement });
  return NextResponse.json({ id, statement }, { status: 201 });
}
