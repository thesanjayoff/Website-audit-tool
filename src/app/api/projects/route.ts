import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/server/repo/projects";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  tags: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const id = await createProject(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
