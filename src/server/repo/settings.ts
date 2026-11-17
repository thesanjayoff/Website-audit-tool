import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";

export type BrandingSettings = {
  agencyName: string;
  primaryColor: string;
  logoUrl: string | null;
};

const DEFAULT_BRANDING: BrandingSettings = {
  agencyName: "Your Agency",
  primaryColor: "#4f46e5",
  logoUrl: null,
};

export async function getBranding(): Promise<BrandingSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "branding"));
  if (!row) return DEFAULT_BRANDING;
  return { ...DEFAULT_BRANDING, ...(row.value as Partial<BrandingSettings>) };
}

export async function setBranding(value: Partial<BrandingSettings>): Promise<BrandingSettings> {
  const current = await getBranding();
  const next = { ...current, ...value };
  await db
    .insert(settings)
    .values({ key: "branding", value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}
