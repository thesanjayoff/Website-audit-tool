import { getJobState, subscribeToJob } from "@/server/jobs/auditJobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ jobKey: string }> }) {
  const { jobKey } = await params;
  const state = getJobState(jobKey);
  if (!state) {
    return new Response("Job not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Replay what's already happened before this subscriber connected.
      for (const message of state.messages) send({ type: "log", message });
      if (state.status !== "running") {
        send({ type: state.status === "done" ? "done" : "failed", error: state.error });
        controller.close();
        return;
      }

      unsubscribe = subscribeToJob(jobKey, (event) => {
        send(event);
        if (event.type === "done" || event.type === "failed") {
          controller.close();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
