"use client";

import { useState } from "react";
import { Check, X, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Finding = {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  explanation: string;
  businessImpact: string;
  fixSuggestion: string;
  effort: string;
  impact: string;
  engine: string;
  wcagCriteria: string[] | null;
  evidence: Array<{ pageUrl: string; selector?: string; snippet?: string; value?: string }>;
  affectedPageIds: string[];
  status: "open" | "fixed" | "ignored";
  note: string | null;
};

export function FindingCard({ finding }: { finding: Finding }) {
  const [status, setStatus] = useState(finding.status);
  const [note, setNote] = useState(finding.note ?? "");
  const [busy, setBusy] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  async function patch(fields: Partial<{ status: typeof status; note: string }>) {
    setBusy(true);
    try {
      await fetch(`/api/findings/${finding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (fields.status) setStatus(fields.status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={finding.severity}>{finding.severity}</Badge>
            <h4 className="font-medium">{finding.title}</h4>
          </div>
          <Badge tone={status}>{status}</Badge>
        </div>
        <p className="text-sm text-[var(--text-muted)]">{finding.explanation}</p>
        <p className="rounded bg-[var(--bg)] p-2 text-sm"><strong>Why it matters:</strong> {finding.businessImpact}</p>
        <p className="rounded bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-2 text-sm"><strong>Fix:</strong> {finding.fixSuggestion}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Effort: {finding.effort}</span>
          <span>Impact: {finding.impact}</span>
          <span>Affects {finding.affectedPageIds.length} page(s)</span>
          <span>Engine: {finding.engine}</span>
          {finding.evidence.length > 0 && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowEvidence((s) => !s)}>
              {showEvidence ? "Hide evidence" : "Show evidence"} {showEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          )}
        </div>
        {showEvidence && (
          <ul className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 text-xs">
            {finding.evidence.slice(0, 10).map((e, i) => (
              <li key={i} className="flex flex-col gap-1">
                <a href={e.pageUrl} target="_blank" rel="noreferrer" className="truncate text-[var(--accent)] underline">{e.pageUrl}</a>
                {e.selector && <code className="text-[var(--text-muted)]">{e.selector}</code>}
                {e.snippet && <pre className="scrollbar-thin overflow-x-auto rounded bg-[var(--bg)] p-2">{e.snippet}</pre>}
                {e.value && <span className="text-[var(--text-muted)]">{e.value}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || status === "fixed"}
            onClick={() => patch({ status: "fixed" })}
            className="hover:border-[var(--good)] hover:text-[var(--good)]"
          >
            <Check size={12} /> Mark fixed
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || status === "ignored"}
            onClick={() => patch({ status: "ignored" })}
          >
            <X size={12} /> Ignore
          </Button>
          {status !== "open" && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => patch({ status: "open" })}>
              <RotateCcw size={12} /> Reopen
            </Button>
          )}
          <Input
            className="ml-auto max-w-[220px]"
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => patch({ note })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
