import { NextResponse } from "next/server";
import { z } from "zod";
import { updateFindingStatus } from "@/server/repo/audits";

const PatchSchema = z.object({
  status: z.enum(["open", "fixed", "ignored"]).optional(),
  note: z.string().max(4000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  await updateFindingStatus(findingId, parsed.data.status, parsed.data.note);
  return NextResponse.json({ ok: true });
}
