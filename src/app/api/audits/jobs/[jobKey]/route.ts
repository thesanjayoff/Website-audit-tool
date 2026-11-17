import { NextResponse } from "next/server";
import { getJobState } from "@/server/jobs/auditJobs";

export async function GET(_req: Request, { params }: { params: Promise<{ jobKey: string }> }) {
  const { jobKey } = await params;
  const state = getJobState(jobKey);
  if (!state) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(state);
}
