"use client";

import { useState } from "react";
import { X, AlertTriangle, OctagonAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
        <Alert
          key={a.id}
          variant={a.severity === "critical" ? "destructive" : "default"}
          className={a.severity === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-300" : undefined}
        >
          {a.severity === "critical" ? <OctagonAlert /> : <AlertTriangle />}
          <AlertDescription className="flex items-center justify-between gap-3 text-current">
            <span>{a.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => dismiss(a.id)}
              aria-label="Dismiss"
              className="shrink-0"
            >
              <X size={14} />
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
