import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { schedules } from "@/server/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  await db.delete(schedules).where(eq(schedules.id, scheduleId));
  return NextResponse.json({ ok: true });
}
