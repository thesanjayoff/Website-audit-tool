"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Branding = { agencyName: string; primaryColor: string; logoUrl: string | null };

export function BrandingForm({ initial }: { initial: Branding }) {
  const [agencyName, setAgencyName] = useState(initial.agencyName);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName, primaryColor, logoUrl: logoUrl || null }),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="font-medium">Report branding</h2>
      <p className="text-sm text-[var(--text-muted)]">Used on the cover of every exported client report.</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">Agency name</span>
        <input className="input" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">Primary color</span>
        <div className="flex items-center gap-2">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 rounded border border-[var(--border)]" />
          <input className="input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">Logo URL (optional)</span>
        <input className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://yourdomain.com/logo.png" />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50">
          Save
        </button>
        {saved && <span className="flex items-center gap-1 text-sm text-[var(--good)]"><Check size={14} /> Saved</span>}
      </div>
    </div>
  );
}
