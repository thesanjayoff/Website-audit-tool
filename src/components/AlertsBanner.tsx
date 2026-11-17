"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Alert = { id: string; siteId: string; severity: "warning" | "critical"; message: string };

export function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  async function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    await fetch(`/api/alerts/${id}`, { method: "PATCH" });
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((a) => (
        <div key={a.id} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${a.severity === "critical" ? "border-[var(--bad)]/40 bg-[var(--bad)]/10 text-[var(--bad)]" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
          <span>{a.message}</span>
          <button onClick={() => dismiss(a.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
