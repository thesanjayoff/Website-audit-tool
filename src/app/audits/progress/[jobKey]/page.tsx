"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AuditProgressPage() {
  const { jobKey } = useParams<{ jobKey: string }>();
  const router = useRouter();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"running" | "done" | "failed">("running");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/audits/jobs/${jobKey}/events`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type: string; message?: string; auditId?: string; error?: string };
      if (data.type === "log" && data.message) {
        if (data.message.startsWith("DONE:")) {
          setStatus("done");
          source.close();
          setTimeout(() => router.push(`/audits/${data.message!.slice(5)}`), 600);
          return;
        }
        if (data.message.startsWith("FAILED:")) return;
        setLines((prev) => [...prev, data.message!]);
      } else if (data.type === "done" && data.auditId) {
        setStatus("done");
        source.close();
        setTimeout(() => router.push(`/audits/${data.auditId}`), 600);
      } else if (data.type === "failed") {
        setStatus("failed");
        setErrorMsg(data.error ?? "Audit failed");
        source.close();
      }
    };
    source.onerror = () => {
      // connection drop; EventSource auto-retries, nothing to do
    };
    return () => source.close();
  }, [jobKey, router]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {status === "running" && <Loader2 className="animate-spin text-[var(--accent)]" />}
        {status === "done" && <CheckCircle2 className="text-[var(--good)]" />}
        {status === "failed" && <XCircle className="text-[var(--bad)]" />}
        <h1 className="text-2xl font-semibold">
          {status === "running" ? "Running audit…" : status === "done" ? "Audit complete" : "Audit failed"}
        </h1>
      </div>
      {errorMsg && (
        <Alert variant="destructive">
          <XCircle />
          <AlertDescription className="text-current">{errorMsg}</AlertDescription>
        </Alert>
      )}
      <Card ref={logRef} className="scrollbar-thin h-96 overflow-y-auto p-4 font-mono text-xs text-[var(--text-muted)]">
        {lines.length === 0 ? (
          <p>Starting up the browser and crawler…</p>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </Card>
    </div>
  );
}
