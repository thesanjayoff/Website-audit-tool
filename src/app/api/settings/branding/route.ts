import { NextResponse } from "next/server";
import { z } from "zod";
import { getBranding, setBranding } from "@/server/repo/settings";

export async function GET() {
  return NextResponse.json(await getBranding());
}

const BrandingSchema = z.object({
  agencyName: z.string().min(1).max(200).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BrandingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const next = await setBranding(parsed.data);
  return NextResponse.json(next);
}
