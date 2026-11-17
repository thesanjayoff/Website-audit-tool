import { NextResponse } from "next/server";
import { acknowledgeAlert } from "@/server/repo/alerts";

export async function PATCH(_req: Request, { params }: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await params;
  await acknowledgeAlert(alertId);
  return NextResponse.json({ ok: true });
}
