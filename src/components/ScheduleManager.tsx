"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
        toast.success(`${frequency === "weekly" ? "Weekly" : "Monthly"} re-audit scheduled`);
      } else {
        toast.error("Could not create schedule");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    toast("Schedule removed");
  }

  return (
    <div className="flex flex-col gap-3">
      {schedules.length === 0 && <p className="text-sm text-[var(--text-muted)]">No recurring audits scheduled.</p>}
      {schedules.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <span className="capitalize">{s.frequency} · next run {new Date(s.nextRunAt).toLocaleDateString()}</span>
          <Tooltip>
            <TooltipTrigger
              render={<Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(s.id)} aria-label="Remove schedule" />}
            >
              <Trash2 size={14} />
            </TooltipTrigger>
            <TooltipContent>Remove schedule</TooltipContent>
          </Tooltip>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "monthly")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={busy} onClick={create}>
          Add schedule
        </Button>
      </div>
    </div>
  );
}
