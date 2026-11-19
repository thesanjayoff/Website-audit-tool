"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Branding = { agencyName: string; primaryColor: string; logoUrl: string | null };

export function BrandingForm({ initial }: { initial: Branding }) {
  const [agencyName, setAgencyName] = useState(initial.agencyName);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName, primaryColor, logoUrl: logoUrl || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Branding saved");
    } catch {
      toast.error("Could not save branding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report branding</CardTitle>
        <CardDescription>Used on the cover of every exported client report.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agency-name">Agency name</Label>
          <Input id="agency-name" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primary-color">Primary color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick primary color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-14 rounded-md border border-[var(--border)]"
            />
            <Input id="primary-color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo-url">Logo URL (optional)</Label>
          <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://yourdomain.com/logo.png" />
        </div>
      </CardContent>
      <CardFooter className="border-t bg-transparent pt-4">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
