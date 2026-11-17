import { EventEmitter } from "node:events";
import { runAudit, type RunAuditInput } from "../audit/runAudit";

/**
 * Single-user local tool: audits run as in-memory background jobs inside the
 * same Node process (no queue needed). Progress is kept in a ring buffer per
 * audit and also emitted live for SSE subscribers so the UI can show a
 * progress display without polling the DB on a tight loop.
 */

type JobState = {
  status: "running" | "done" | "failed";
  messages: string[];
  error?: string;
};

const jobs = new Map<string, JobState>();
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const MAX_LOG_LINES = 500;

export function startAuditJob(input: Omit<RunAuditInput, "onProgress">): { jobKey: string } {
  const jobKey = `${input.siteId}:${Date.now()}`;
  const state: JobState = { status: "running", messages: [] };
  jobs.set(jobKey, state);

  const push = (msg: string) => {
    state.messages.push(msg);
    if (state.messages.length > MAX_LOG_LINES) state.messages.shift();
    emitter.emit(jobKey, { type: "log", message: msg });
  };

  runAudit({ ...input, onProgress: push })
    .then((auditId) => {
      state.status = "done";
      push(`DONE:${auditId}`);
      emitter.emit(jobKey, { type: "done", auditId });
    })
    .catch((err) => {
      state.status = "failed";
      state.error = err instanceof Error ? err.message : String(err);
      push(`FAILED:${state.error}`);
      emitter.emit(jobKey, { type: "failed", error: state.error });
    });

  return { jobKey };
}

export function getJobState(jobKey: string): JobState | null {
  return jobs.get(jobKey) ?? null;
}

export function subscribeToJob(jobKey: string, listener: (event: { type: string; [k: string]: unknown }) => void): () => void {
  emitter.on(jobKey, listener);
  return () => emitter.off(jobKey, listener);
}
