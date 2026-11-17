import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverPages } from "@/server/crawler/crawl";
import { SsrfBlockedError } from "@/server/security/ssrf";
import { CRAWL_DEFAULTS } from "@/server/config/thresholds";

const DiscoverSchema = z.object({
  baseUrl: z.string().url(),
  maxPages: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = DiscoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await discoverPages(parsed.data.baseUrl, parsed.data.maxPages ?? CRAWL_DEFAULTS.maxPages);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Discovery failed" }, { status: 500 });
  }
}
