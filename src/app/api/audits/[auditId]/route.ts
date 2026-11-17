import { NextResponse } from "next/server";
import { getAuditDetail } from "@/server/repo/audits";

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const detail = await getAuditDetail(auditId);
  if (!detail) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  return NextResponse.json(detail);
}
