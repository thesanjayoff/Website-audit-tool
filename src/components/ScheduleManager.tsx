"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

type Schedule = {
  id: string;
  frequency: "weekly" | "monthly";
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  alertOnScoreDropPoints: number;
  alertOnCertExpiryDays: number;
};

export function ScheduleManager({ siteId, initialSchedules }: { siteId: string; initialSchedules: Schedule[] }) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency }),
      });
      const data = await res.json();
      if (res.ok) {
        setSchedules((prev) => [...prev, { id: data.id, frequency, active: true, nextRunAt: new Date().toISOString(), lastRunAt: null, alertOnScoreDropPoints: 5, alertOnCertExpiryDays: 14 }]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {schedules.length === 0 && <p className="text-sm text-[var(--text-muted)]">No recurring audits scheduled.</p>}
      {schedules.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <span className="capitalize">{s.frequency} · next run {new Date(s.nextRunAt).toLocaleDateString()}</span>
          <button onClick={() => remove(s.id)} className="text-[var(--text-muted)] hover:text-[var(--bad)]"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <select className="input w-auto" value={frequency} onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button disabled={busy} onClick={create} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50">
          Add schedule
        </button>
      </div>
    </div>
  );
}
