import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { schedules } from "@/server/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const rows = await db.select().from(schedules).where(eq(schedules.siteId, siteId));
  return NextResponse.json({ schedules: rows });
}

const CreateScheduleSchema = z.object({
  frequency: z.enum(["weekly", "monthly"]),
  alertOnScoreDropPoints: z.number().min(1).max(50).optional(),
  alertOnCertExpiryDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateScheduleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const days = parsed.data.frequency === "weekly" ? 7 : 30;
  const id = randomUUID();
  await db.insert(schedules).values({
    id,
    siteId,
    frequency: parsed.data.frequency,
    alertOnScoreDropPoints: parsed.data.alertOnScoreDropPoints ?? 5,
    alertOnCertExpiryDays: parsed.data.alertOnCertExpiryDays ?? 14,
    nextRunAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  });
  return NextResponse.json({ id }, { status: 201 });
}
