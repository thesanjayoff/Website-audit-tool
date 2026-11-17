"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Globe, ListChecks, Settings2, AlertTriangle } from "lucide-react";
import type { DiscoveredPage } from "@/server/crawler/crawl";

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
        <div className="card flex items-center gap-2 border-[var(--bad)]/40 p-3 text-sm text-[var(--bad)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {step === 0 && (
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="flex items-center gap-2 font-medium"><Globe size={18} /> Site details</h2>
          <Field label="Project">
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— create new project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {!projectId && (
            <Field label="New project name">
              <input className="input" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Acme Corp" />
            </Field>
          )}
          <Field label="Site URL">
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="Label (optional)">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Acme Corp — production site" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLocalBusiness} onChange={(e) => setIsLocalBusiness(e.target.checked)} />
            This is a local business (enables NAP/local SEO checks)
          </label>
          <WizardFooter onNext={() => setStep(1)} nextDisabled={!baseUrl.startsWith("http") || (!projectId && !newProjectName.trim())} />
        </div>
      )}

      {step === 1 && (
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="flex items-center gap-2 font-medium"><ShieldCheck size={18} /> Permission to audit</h2>
          <p className="text-sm text-[var(--text-muted)]">
            This tool only runs passive checks (no login attempts, no vulnerability probing, no fuzzing), respects robots.txt, and uses polite
            rate limits. You still must confirm you have the right to test this site — this is recorded in the audit log.
          </p>
          <Field label="Your name">
            <input className="input" value={confirmedBy} onChange={(e) => setConfirmedBy(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={permissionChecked} onChange={(e) => setPermissionChecked(e.target.checked)} />
            I confirm that I own <strong className="mx-1">{baseUrl}</strong> or have explicit permission from its owner to run this audit.
          </label>
          <WizardFooter onBack={existingSite ? undefined : () => setStep(0)} onNext={handleDiscover} nextDisabled={!confirmedBy.trim() || !permissionChecked} busy={busy} nextLabel="Discover pages" />
        </div>
      )}

      {step === 2 && (
        <div className="card flex items-center justify-center gap-3 p-12 text-[var(--text-muted)]">
          <Loader2 className="animate-spin" /> Discovering pages…
        </div>
      )}

      {step === 3 && discovered && (
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="flex items-center gap-2 font-medium"><ListChecks size={18} /> Select pages to audit ({selectedCount} selected)</h2>
          {robotsNote && <p className="text-xs text-[var(--text-muted)]">{robotsNote}</p>}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border)]">
            {discovered.map((p, i) => (
              <label key={p.url} className={`flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0 ${!p.loadOk ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) => {
                    const copy = [...discovered];
                    copy[i] = { ...p, selected: e.target.checked };
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
            <input className="input flex-1" placeholder="Add a page URL manually" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
            <button type="button" onClick={addManualUrl} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Add</button>
          </div>
          <WizardFooter onBack={() => setStep(1)} onNext={() => setStep(4)} nextDisabled={selectedCount === 0} />
        </div>
      )}

      {step === 4 && (
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="flex items-center gap-2 font-medium"><Settings2 size={18} /> Audit settings</h2>
          <Field label="Lighthouse runs per page (median is reported, since single runs vary)">
            <input className="input" type="number" min={1} max={5} value={lighthouseRuns} onChange={(e) => setLighthouseRuns(Number(e.target.value))} />
          </Field>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={devices.mobile} onChange={(e) => setDevices({ ...devices, mobile: e.target.checked })} /> Mobile</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={devices.desktop} onChange={(e) => setDevices({ ...devices, desktop: e.target.checked })} /> Desktop</label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={checkExposedFiles} onChange={(e) => setCheckExposedFiles(e.target.checked)} />
            Also check for accidentally exposed files (.git, .env) — single polite request each, only run because you confirmed permission.
          </label>
          <WizardFooter onBack={() => setStep(3)} onNext={handleStart} nextDisabled={!devices.mobile && !devices.desktop} busy={busy} nextLabel="Start audit" />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
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
        <button type="button" onClick={onBack} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Back</button>
      ) : <span />}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || busy}
        className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />} {nextLabel}
      </button>
    </div>
  );
}
