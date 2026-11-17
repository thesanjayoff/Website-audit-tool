import { randomUUID } from "node:crypto";
import { db } from "./client";
import { projects, sites, permissionConfirmations, audits, auditPages, findings, type AuditConfig, type PageMetrics } from "./schema";
import type { FindingEvidence } from "./schema";

/**
 * Seeds two demo projects with two audits each (so the dashboard, trend
 * charts, and "what changed since last audit" diff all have something real
 * to show on first run). This is synthetic data clearly scoped to two
 * obviously-fake demo domains — never used for a real audit.
 */

const DEMO_CONFIG: AuditConfig = {
  maxPages: 6,
  lighthouseRuns: 3,
  devices: ["mobile", "desktop"],
  concurrency: 1,
  checkExposedFiles: false,
};

function lab(overrides: Partial<PageMetrics["lab"]> = {}): PageMetrics {
  return {
    lab: {
      lighthousePerformanceScore: 82,
      lighthouseSeoScore: 90,
      lighthouseBestPracticesScore: 88,
      lcpMs: 2300,
      clsScore: 0.06,
      tbtMs: 180,
      fcpMs: 1200,
      speedIndex: 2800,
      ttfbMs: 400,
      lcpElement: "<img class=\"hero\">",
      runsUsed: 3,
      ...overrides,
    },
  };
}

function evidence(pageUrl: string, extra: Partial<FindingEvidence> = {}): FindingEvidence[] {
  return [{ pageUrl, ...extra }];
}

async function seedSite(opts: {
  projectName: string;
  siteLabel: string;
  baseUrl: string;
  isLocalBusiness: boolean;
  olderScores: { overall: number; perf: number; seo: number; a11y: number; sec: number };
  newerScores: { overall: number; perf: number; seo: number; a11y: number; sec: number };
}) {
  const projectId = randomUUID();
  await db.insert(projects).values({ id: projectId, name: opts.projectName, tags: ["demo"] });

  const siteId = randomUUID();
  await db.insert(sites).values({
    id: siteId,
    projectId,
    baseUrl: opts.baseUrl,
    label: opts.siteLabel,
    isLocalBusiness: opts.isLocalBusiness,
  });

  const confirmationId = randomUUID();
  await db.insert(permissionConfirmations).values({
    id: confirmationId,
    siteId,
    confirmedBy: "Demo Seed",
    statement: `I, Demo Seed, confirm that I own ${opts.baseUrl} or have explicit permission from its owner to run a passive audit against it. (Seeded demo data.)`,
  });

  const olderDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
  const newerDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const olderAuditId = await seedAudit(siteId, confirmationId, opts.baseUrl, opts.olderScores, olderDate, "older");
  const newerAuditId = await seedAudit(siteId, confirmationId, opts.baseUrl, opts.newerScores, newerDate, "newer");

  return { projectId, siteId, olderAuditId, newerAuditId };
}

async function seedAudit(
  siteId: string,
  confirmationId: string,
  baseUrl: string,
  scores: { overall: number; perf: number; seo: number; a11y: number; sec: number },
  startedAt: Date,
  variant: "older" | "newer",
) {
  const auditId = randomUUID();
  await db.insert(audits).values({
    id: auditId,
    siteId,
    permissionConfirmationId: confirmationId,
    status: "done",
    config: DEMO_CONFIG,
    lighthouseVersion: "13.6.0",
    axeCoreVersion: "4.14.1",
    pa11yVersion: "10.0.0",
    overallScore: scores.overall,
    performanceScore: scores.perf,
    seoScore: scores.seo,
    accessibilityScore: scores.a11y,
    securityScore: scores.sec,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date(startedAt.getTime() + 6 * 60 * 1000).toISOString(),
  });

  const homePageId = randomUUID();
  const contactPageId = randomUUID();

  await db.insert(auditPages).values([
    {
      id: homePageId,
      auditId,
      url: `${baseUrl}/`,
      pageType: "home",
      device: "desktop",
      loadOk: true,
      httpStatus: 200,
      metrics: lab({ lighthousePerformanceScore: scores.perf, lighthouseSeoScore: scores.seo }),
      headers: { "content-type": "text/html; charset=utf-8" },
      tls: { valid: true, issuer: "Let's Encrypt", validFrom: null, validTo: null, daysUntilExpiry: 62, protocol: "TLSv1.3", cipher: "TLS_AES_128_GCM_SHA256", httpsRedirect: true, error: null },
      crux: { scope: "page", hasData: false },
    },
    {
      id: contactPageId,
      auditId,
      url: `${baseUrl}/contact`,
      pageType: "contact",
      device: "desktop",
      loadOk: true,
      httpStatus: 200,
      metrics: lab({ lighthousePerformanceScore: scores.perf - 4, lighthouseSeoScore: scores.seo - 2 }),
      headers: { "content-type": "text/html; charset=utf-8" },
      tls: { valid: true, issuer: "Let's Encrypt", validFrom: null, validTo: null, daysUntilExpiry: 62, protocol: "TLSv1.3", cipher: "TLS_AES_128_GCM_SHA256", httpsRedirect: true, error: null },
      crux: { scope: "page", hasData: false },
    },
  ]);

  type SeedFindingRow = {
    category: "performance" | "seo" | "accessibility" | "security" | "content";
    engine: string;
    title: string;
    explanation: string;
    businessImpact: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    effort: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    evidence: FindingEvidence[];
    fixSuggestion: string;
    affectedPageIds: string[];
  };

  const findingRows: SeedFindingRow[] = [
    {
      category: "performance",
      engine: "lighthouse",
      title: "Hero image is not served in a modern format",
      explanation: "The homepage's hero image is a large PNG; converting it to WebP/AVIF would cut its size significantly.",
      businessImpact: "Slower image loads push back Largest Contentful Paint, which can hurt both conversions and Core Web Vitals-linked search signals.",
      severity: "medium" as const,
      effort: "low" as const,
      impact: "medium" as const,
      evidence: evidence(`${baseUrl}/`, { value: "~340KB potential savings" }),
      fixSuggestion: "Re-export the hero image as WebP (with a JPEG fallback) and serve it via <picture> or a modern image CDN.",
      affectedPageIds: [homePageId],
    },
    {
      category: "seo" as const,
      engine: "seo-checks",
      title: "Missing meta description",
      explanation: "The contact page has no meta description, so search engines will auto-generate a snippet.",
      businessImpact: "An auto-generated snippet is less persuasive than a written one and can hurt click-through from search results.",
      severity: "medium" as const,
      effort: "low" as const,
      impact: "medium" as const,
      evidence: evidence(`${baseUrl}/contact`),
      fixSuggestion: "Add a unique, ~150-character meta description summarizing what visitors can do on this page.",
      affectedPageIds: [contactPageId],
    },
    {
      category: "accessibility" as const,
      engine: "axe-core",
      title: "Form elements must have labels",
      explanation: "The contact form's phone number field has no associated <label>, aria-label, or aria-labelledby.",
      businessImpact: "Screen reader users may not understand what the field is for, which can mean a lost lead.",
      severity: variant === "older" ? "high" as const : "medium" as const,
      effort: "low" as const,
      impact: "high" as const,
      evidence: evidence(`${baseUrl}/contact`, { selector: "#phone", snippet: '<input id="phone" type="tel">' }),
      fixSuggestion: 'Add <label for="phone">Phone number</label> immediately before the field.',
      affectedPageIds: [contactPageId],
    },
    {
      category: "security" as const,
      engine: "header-check",
      title: "Missing Content-Security-Policy header",
      explanation: "No Content-Security-Policy header was found on either page audited.",
      businessImpact: "Without a CSP, the browser has no extra protection against injected scripts beyond the page's own code.",
      severity: "high" as const,
      effort: "low" as const,
      impact: "high" as const,
      evidence: evidence(`${baseUrl}/`),
      fixSuggestion: "Add a Content-Security-Policy header, starting in report-only mode to avoid breaking the site.",
      affectedPageIds: [homePageId, contactPageId],
    },
    {
      category: "content" as const,
      engine: "content-checks",
      title: "8 tap targets smaller than the recommended 24x24px minimum",
      explanation: "Several footer links and icon buttons render below the recommended minimum touch target size on mobile.",
      businessImpact: "Visitors on mobile may mis-tap small controls, which is a small but real conversion drag.",
      severity: "low" as const,
      effort: "low" as const,
      impact: "medium" as const,
      evidence: evidence(`${baseUrl}/`),
      fixSuggestion: "Increase tap target size to at least 24x24 CSS pixels with adequate spacing.",
      affectedPageIds: [homePageId],
    },
  ];

  // The "newer" audit resolves the clickjacking-style header finding to
  // demonstrate the before/after diff and a "fixed" status in the UI.
  if (variant === "newer") {
    findingRows.push({
      category: "security" as const,
      engine: "header-check",
      title: "No clickjacking protection (X-Frame-Options or frame-ancestors)",
      explanation: "This was present in the previous audit and has since been fixed — kept here, marked fixed, to show the history view.",
      businessImpact: "Resolved: the site now sets frame-ancestors via its CSP.",
      severity: "low" as const,
      effort: "low" as const,
      impact: "medium" as const,
      evidence: evidence(`${baseUrl}/`),
      fixSuggestion: "Already fixed.",
      affectedPageIds: [homePageId],
    });
  }

  await db.insert(findings).values(
    findingRows.map((f) => ({
      id: randomUUID(),
      auditId,
      groupKey: `${f.engine}:${f.title}`,
      wcagCriteria: f.category === "accessibility" ? ["4.1.2"] : [],
      status: variant === "newer" && f.title.startsWith("No clickjacking") ? ("fixed" as const) : ("open" as const),
      note: null,
      aiRewritten: false,
      ...f,
    })),
  );

  return auditId;
}

async function main() {
  await seedSite({
    projectName: "Riverside Dental",
    siteLabel: "Riverside Dental — main site",
    baseUrl: "https://riverside-dental.demo.invalid",
    isLocalBusiness: true,
    olderScores: { overall: 61, perf: 58, seo: 72, a11y: 55, sec: 60 },
    newerScores: { overall: 74, perf: 70, seo: 80, a11y: 68, sec: 78 },
  });

  await seedSite({
    projectName: "Northwind Outfitters",
    siteLabel: "Northwind Outfitters — storefront",
    baseUrl: "https://northwind-outfitters.demo.invalid",
    isLocalBusiness: false,
    olderScores: { overall: 70, perf: 65, seo: 75, a11y: 70, sec: 72 },
    newerScores: { overall: 69, perf: 60, seo: 76, a11y: 71, sec: 72 },
  });

  // eslint-disable-next-line no-console
  console.log("Seeded 2 demo projects with 2 audits each.");
}

main().then(() => process.exit(0)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
