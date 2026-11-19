"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Globe, ListChecks, Settings2, AlertTriangle, Check } from "lucide-react";
import type { DiscoveredPage } from "@/server/crawler/crawl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Project = { id: string; name: string };
type ExistingSite = { id: string; baseUrl: string; label: string; projectId: string };
type CompetitorOf = { id: string; projectId: string };
type PageTarget = { url: string; pageType: DiscoveredPage["pageType"]; selected: boolean; title: string | null; loadOk: boolean };

const STEPS = ["Site", "Permission", "Pages", "Settings", "Review"] as const;

export function NewAuditWizard({
  projects,
  existingSite = null,
  competitorOf = null,
}: {
  projects: Project[];
  existingSite?: ExistingSite | null;
  competitorOf?: CompetitorOf | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(existingSite ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 0: site
  const [projectId, setProjectId] = useState(existingSite?.projectId ?? competitorOf?.projectId ?? projects[0]?.id ?? "");
  const [newProjectName, setNewProjectName] = useState("");
  const [baseUrl, setBaseUrl] = useState(existingSite?.baseUrl ?? "https://");
  const [label, setLabel] = useState(existingSite?.label ?? "");
  const [isLocalBusiness, setIsLocalBusiness] = useState(false);

  // Step 1: permission
  const [confirmedBy, setConfirmedBy] = useState("");
  const [permissionChecked, setPermissionChecked] = useState(false);

  // Step 2: discovery
  const [maxPages, setMaxPages] = useState(20);
  const [discovered, setDiscovered] = useState<PageTarget[] | null>(null);
  const [robotsNote, setRobotsNote] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  // Step 3: settings
  const [lighthouseRuns, setLighthouseRuns] = useState(3);
  const [devices, setDevices] = useState<{ mobile: boolean; desktop: boolean }>({ mobile: true, desktop: true });
  const [checkExposedFiles, setCheckExposedFiles] = useState(false);

  async function handleDiscover() {
    setBusy(true);
    setError(null);
    setStep(2);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, maxPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Discovery failed");
      const pages: PageTarget[] = data.pages.map((p: DiscoveredPage) => ({
        url: p.url,
        pageType: p.pageType,
        selected: p.loadOk,
        title: p.title,
        loadOk: p.loadOk,
      }));
      setDiscovered(pages);
      if (!data.robotsAllowsAll) setRobotsNote("robots.txt restricts some crawling on this site — respected automatically.");
      else if (!data.sitemapFound) setRobotsNote("No sitemap.xml found — discovery relied on following links instead.");
      else setRobotsNote(null);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  function addManualUrl() {
    if (!manualUrl.trim() || !discovered) return;
    setDiscovered([...discovered, { url: manualUrl.trim(), pageType: "other", selected: true, title: null, loadOk: true }]);
    setManualUrl("");
  }

  async function handleStart() {
    if (!discovered) return;
    setBusy(true);
    setError(null);
    try {
      let siteId = existingSite?.id ?? "";

      if (!siteId) {
        let finalProjectId = projectId;
        if (!finalProjectId && newProjectName.trim()) {
          const res = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newProjectName.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error("Could not create project");
          finalProjectId = data.id;
        }
        if (!finalProjectId) throw new Error("Choose or create a project first");

        const siteRes = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: finalProjectId,
            baseUrl,
            label: label || new URL(baseUrl).hostname,
            isLocalBusiness,
            isCompetitor: !!competitorOf,
            competitorOfSiteId: competitorOf?.id,
          }),
        });
        const siteData = await siteRes.json();
        if (!siteRes.ok) throw new Error(siteData.error ?? "Could not create site");
        siteId = siteData.id;
      }

      const confirmRes = await fetch(`/api/sites/${siteId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedBy }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error("Could not record permission confirmation");

      const selectedPages = discovered.filter((p) => p.selected).map((p) => ({ url: p.url, pageType: p.pageType }));
      const deviceList = Object.entries(devices).filter(([, v]) => v).map(([k]) => k);

      const auditRes = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          permissionConfirmationId: confirmData.id,
          pages: selectedPages,
          lighthouseRuns,
          devices: deviceList,
          checkExposedFiles,
        }),
      });
      const auditData = await auditRes.json();
      if (!auditRes.ok) throw new Error(auditData.error ?? "Could not start audit");

      router.push(`/audits/progress/${auditData.jobKey}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const selectedCount = discovered?.filter((p) => p.selected).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i === step ? "font-semibold text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${i <= step ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"}`}>
              {i + 1}
            </span>
            {s}
            {i < STEPS.length - 1 && <span className="mx-1 text-[var(--border)]">—</span>}
          </li>
        ))}
      </ol>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription className="text-current">{error}</AlertDescription>
        </Alert>
      )}

      {step === 0 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-medium"><Globe size={18} /> Site details</h2>
          <Field label="Project">
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— create new project —" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {!projectId && (
            <Field label="New project name">
              <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Acme Corp" />
            </Field>
          )}
          <Field label="Site URL">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="Label (optional)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Acme Corp — production site" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isLocalBusiness} onCheckedChange={(v) => setIsLocalBusiness(v === true)} />
            This is a local business (enables NAP/local SEO checks)
          </label>
          <WizardFooter onNext={() => setStep(1)} nextDisabled={!baseUrl.startsWith("http") || (!projectId && !newProjectName.trim())} />
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-medium"><ShieldCheck size={18} /> Permission to audit</h2>
          <p className="text-sm text-[var(--text-muted)]">
            This tool only runs passive checks (no login attempts, no vulnerability probing, no fuzzing), respects robots.txt, and uses polite
            rate limits. You still must confirm you have the right to test this site — this is recorded in the audit log.
          </p>
          <Field label="Your name">
            <Input value={confirmedBy} onChange={(e) => setConfirmedBy(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={permissionChecked} onCheckedChange={(v) => setPermissionChecked(v === true)} />
            I confirm that I own <strong className="mx-1">{baseUrl}</strong> or have explicit permission from its owner to run this audit.
          </label>
          <WizardFooter onBack={existingSite ? undefined : () => setStep(0)} onNext={handleDiscover} nextDisabled={!confirmedBy.trim() || !permissionChecked} busy={busy} nextLabel="Discover pages" />
        </Card>
      )}

      {step === 2 && (
        <Card className="flex items-center justify-center gap-3 p-12 text-[var(--text-muted)]">
          <Loader2 className="animate-spin" /> Discovering pages…
        </Card>
      )}

      {step === 3 && discovered && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-medium"><ListChecks size={18} /> Select pages to audit ({selectedCount} selected)</h2>
          {robotsNote && <p className="text-xs text-[var(--text-muted)]">{robotsNote}</p>}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border)]">
            {discovered.map((p, i) => (
              <label key={p.url} className={`flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0 ${!p.loadOk ? "opacity-60" : ""}`}>
                <Checkbox
                  checked={p.selected}
                  onCheckedChange={(v) => {
                    const copy = [...discovered];
                    copy[i] = { ...p, selected: v === true };
                    setDiscovered(copy);
                  }}
                />
                <span className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">{p.pageType}</span>
                <span className="flex-1 truncate">{p.title || p.url}</span>
                {!p.loadOk && <span className="text-xs text-[var(--bad)]">failed to load</span>}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Add a page URL manually" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
            <Button type="button" variant="outline" onClick={addManualUrl}>Add</Button>
          </div>
          <WizardFooter onBack={() => setStep(1)} onNext={() => setStep(4)} nextDisabled={selectedCount === 0} />
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-medium"><Settings2 size={18} /> Audit settings</h2>
          <Field label="Lighthouse runs per page (median is reported, since single runs vary)">
            <Input type="number" min={1} max={5} value={lighthouseRuns} onChange={(e) => setLighthouseRuns(Number(e.target.value))} />
          </Field>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={devices.mobile} onCheckedChange={(v) => setDevices({ ...devices, mobile: v === true })} /> Mobile</label>
            <label className="flex items-center gap-2"><Checkbox checked={devices.desktop} onCheckedChange={(v) => setDevices({ ...devices, desktop: v === true })} /> Desktop</label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={checkExposedFiles} onCheckedChange={(v) => setCheckExposedFiles(v === true)} />
            Also check for accidentally exposed files (.git, .env) — single polite request each, only run because you confirmed permission.
          </label>
          <WizardFooter onBack={() => setStep(3)} onNext={handleStart} nextDisabled={!devices.mobile && !devices.desktop} busy={busy} nextLabel="Start audit" />
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <Label className="text-[var(--text-muted)]">{label}</Label>
      {children}
    </div>
  );
}

function WizardFooter({
  onBack,
  onNext,
  nextDisabled,
  busy,
  nextLabel = "Next",
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  busy?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex justify-between pt-2">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
      ) : <span />}
      <Button type="button" onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : nextLabel === "Start audit" ? <Check size={14} /> : null} {nextLabel}
      </Button>
    </div>
  );
}
