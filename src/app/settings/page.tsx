import { getBranding } from "@/server/repo/settings";
import { BrandingForm } from "./BrandingForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const branding = await getBranding();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--text-muted)]">
          All data stays local in <code>data/audit-tool.sqlite</code>. Optional field-data (CrUX) and AI layer keys are configured via
          environment variables — see <code>.env.example</code>.
        </p>
      </div>
      <BrandingForm initial={branding} />
    </div>
  );
}
