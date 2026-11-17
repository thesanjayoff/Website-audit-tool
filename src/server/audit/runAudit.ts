import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, SCREENSHOTS_DIR } from "../db/client";
import { audits, auditPages, findings as findingsTable, type AuditConfig } from "../db/schema";
import { newIsolatedContext } from "../browser/chromium";
import { DEVICE_PROFILES } from "../browser/chromium";
import { CRAWL_DEFAULTS } from "../config/thresholds";
import { runLighthouseMedian, toPageMetrics, LIGHTHOUSE_VERSION } from "../engines/lighthouse";
import { runAxe, runPa11y, runManualHeuristicChecks, injectAxeIntoContext, AXE_CORE_VERSION, PA11Y_VERSION } from "../engines/accessibility";
import {
  gradeSecurityHeaders,
  checkTls,
  tlsFindings,
  mixedContentFindings,
  checkExposedFiles,
  inventoryThirdPartyScripts,
  detectCookieBanner,
  detectDirectoryListing,
  checkHttpsRedirect,
} from "../engines/security";
import { extractSeoFacts, runSeoPageChecks, runSiteWideSeoChecks, checkInternalLinks, type SeoPageFacts } from "../engines/seo";
import {
  computeReadability,
  readabilityFinding,
  checkBrokenImagesAndFavicon,
  checkTapTargetsAndFontSizes,
  checkContactInfoPresence,
} from "../engines/content";
import { fetchCruxSummary } from "../engines/crux";
import type { FindingDraft } from "../engines/types";
import { computeScores, deduplicateFindings, type PageAuditResult } from "../scoring/aggregate";
import type { DiscoveredPage } from "../crawler/crawl";

export type AuditTarget = {
  url: string;
  pageType: DiscoveredPage["pageType"];
};

export type RunAuditInput = {
  siteId: string;
  baseUrl: string;
  isLocalBusiness: boolean;
  permissionConfirmationId: string;
  pages: AuditTarget[];
  config: AuditConfig;
  onProgress?: (msg: string) => void;
};

export async function runAudit(input: RunAuditInput): Promise<string> {
  const auditId = randomUUID();
  const log = (msg: string) => input.onProgress?.(msg);

  await db.insert(audits).values({
    id: auditId,
    siteId: input.siteId,
    permissionConfirmationId: input.permissionConfirmationId,
    status: "crawling",
    config: input.config,
    lighthouseVersion: LIGHTHOUSE_VERSION,
    axeCoreVersion: AXE_CORE_VERSION,
    pa11yVersion: PA11Y_VERSION,
  });

  try {
    await db.update(audits).set({ status: "auditing" }).where(eq(audits.id, auditId));

    const tlsCache = new Map<string, Awaited<ReturnType<typeof checkTls>>>();
    const allSeoFacts: SeoPageFacts[] = [];
    const linksBySourcePage = new Map<string, string[]>();
    const pageResults: PageAuditResult[] = [];
    const sharedFindings: FindingDraft[] = []; // site-wide findings (exposed files, etc.), attached to the first page row

    let firstDesktopAuditPageId: string | null = null;

    for (const target of input.pages) {
      log(`Auditing ${target.url}`);
      const hostname = new URL(target.url).hostname;

      // ---- Desktop pass: full DOM-dependent checks + desktop Lighthouse ----
      const desktopPageId = randomUUID();
      if (!firstDesktopAuditPageId) firstDesktopAuditPageId = desktopPageId;
      const desktopContext = await newIsolatedContext(DEVICE_PROFILES.desktop);
      await injectAxeIntoContext(desktopContext);
      const desktopPage = await desktopContext.newPage();

      let html = "";
      let headers: Record<string, string> = {};
      let httpStatus: number | null = null;
      let loadOk = true;
      let loadError: string | null = null;
      const pageFindings: FindingDraft[] = [];

      // A failure in any ONE check below must not wipe out findings from the
      // others, so each risky step gets its own try/catch and logs a warning
      // instead of aborting the whole page (e.g. a strict CSP blocking
      // axe-core's script injection shouldn't also lose the SEO/header findings).
      const safely = async (label: string, fn: () => Promise<void> | void) => {
        try {
          await fn();
        } catch (err) {
          log(`${label} failed for ${target.url}: ${err instanceof Error ? err.message : err}`);
        }
      };

      let facts: SeoPageFacts | null = null;

      try {
        const response = await desktopPage.goto(target.url, {
          waitUntil: "networkidle",
          timeout: CRAWL_DEFAULTS.perRequestTimeoutMs,
        });
        httpStatus = response?.status() ?? null;
        if (!response || response.status() >= 400) {
          loadOk = false;
          loadError = `HTTP ${httpStatus ?? "unknown"}`;
        }
        headers = response?.headers() ?? {};
        html = await desktopPage.content();
      } catch (err) {
        loadOk = false;
        loadError = err instanceof Error ? err.message : "Failed to load page";
        log(`Error loading ${target.url}: ${loadError}`);
      }

      if (loadOk) {
        await safely("SEO checks", () => {
          facts = extractSeoFacts(html, target.url);
          allSeoFacts.push(facts);
          linksBySourcePage.set(target.url, facts.internalLinks);
          pageFindings.push(...runSeoPageChecks(facts, target.pageType));
        });

        await safely("Security header check", () => {
          const headerResult = gradeSecurityHeaders(headers, target.url);
          pageFindings.push(...headerResult.findings);
          pageFindings.push(...mixedContentFindings(html, target.url));
        });

        await safely("TLS check", async () => {
          if (!tlsCache.has(hostname)) {
            tlsCache.set(hostname, await checkTls(hostname));
          }
          const tlsInfo = tlsCache.get(hostname)!;
          if (tlsInfo.httpsRedirect === null) {
            tlsInfo.httpsRedirect = await checkHttpsRedirect(target.url);
          }
          pageFindings.push(...tlsFindings(tlsInfo, target.url));
          if (tlsInfo.httpsRedirect === false) {
            pageFindings.push({
              category: "security",
              engine: "tls-check",
              title: "HTTP does not redirect to HTTPS",
              explanation: "Requesting the HTTP version of this page did not result in an HTTPS redirect.",
              businessImpact: "Visitors who type the address without https:// (or follow an old http:// link) stay on an insecure connection.",
              severity: "medium",
              effort: "low",
              impact: "medium",
              evidence: [{ pageUrl: target.url }],
              fixSuggestion: "Configure the web server to redirect all HTTP requests to HTTPS with a 301.",
              wcagCriteria: [],
              groupKeyOverride: "tls-check:no-https-redirect",
            });
          }
        });

        await safely("axe-core", async () => {
          pageFindings.push(...(await runAxe(desktopPage, target.url)));
        });
        await safely("Manual accessibility heuristics", async () => {
          pageFindings.push(...(await runManualHeuristicChecks(desktopPage, target.url)));
        });
        await safely("Pa11y", async () => {
          pageFindings.push(...(await runPa11y(target.url, target.url)));
        });

        await safely("Readability check", () => {
          const readability = computeReadability(html);
          const readFinding = readabilityFinding(readability, target.url);
          if (readFinding) pageFindings.push(readFinding);
        });
        await safely("Broken image/favicon check", async () => {
          pageFindings.push(...(await checkBrokenImagesAndFavicon(desktopPage, target.url)));
        });
        await safely("Contact info check", () => {
          if (facts) pageFindings.push(...checkContactInfoPresence(facts, html));
        });

        await safely("Third-party script/cookie-banner check", () => {
          const thirdParty = inventoryThirdPartyScripts(html, target.url);
          if (thirdParty.length > 0) {
            pageFindings.push({
              category: "security",
              engine: "third-party-inventory",
              title: `${thirdParty.length} third-party script domain(s) loaded`,
              explanation: `Scripts are loaded from: ${thirdParty.map((t) => `${t.domain} (${t.category})`).join(", ")}.`,
              businessImpact: "Each third-party script is a privacy consideration and a small performance/security trust dependency; review whether all are necessary and disclosed in your privacy policy.",
              severity: "info",
              effort: "low",
              impact: "low",
              evidence: [{ pageUrl: target.url, value: thirdParty.map((t) => t.domain).join(", ") }],
              fixSuggestion: "Remove any third-party scripts you no longer need, and disclose the rest in your privacy/cookie policy.",
              wcagCriteria: [],
              groupKeyOverride: "third-party-inventory:scripts",
            });
            if (!detectCookieBanner(html)) {
              pageFindings.push({
                category: "security",
                engine: "third-party-inventory",
                title: "Third-party tracking scripts present but no cookie banner detected",
                explanation: "The page loads analytics/advertising scripts but no cookie-consent banner markup or text was detected.",
                businessImpact: "Many jurisdictions (e.g. under GDPR) require consent before non-essential tracking; this may be a compliance gap worth a legal review.",
                severity: "medium",
                effort: "medium",
                impact: "medium",
                evidence: [{ pageUrl: target.url }],
                fixSuggestion: "Add a cookie consent mechanism before non-essential trackers load, and consult counsel on applicable requirements.",
                wcagCriteria: [],
                groupKeyOverride: "third-party-inventory:no-cookie-banner",
              });
            }
          }
          if (detectDirectoryListing(html)) {
            pageFindings.push({
              category: "security",
              engine: "exposure-check",
              title: "Directory listing appears to be enabled",
              explanation: "The response looks like an auto-generated directory index rather than a normal page.",
              businessImpact: "Directory listings can expose files that were never meant to be browsable, including backups or configuration files.",
              severity: "high",
              effort: "low",
              impact: "high",
              evidence: [{ pageUrl: target.url }],
              fixSuggestion: "Disable directory listing/autoindex on the web server for this path.",
              wcagCriteria: [],
              groupKeyOverride: "exposure-check:directory-listing",
            });
          }
        });
      }

      let desktopLighthouse;
      let desktopTapFindings: FindingDraft[] = [];
      try {
        desktopTapFindings = await checkTapTargetsAndFontSizes(desktopPage, target.url);
      } catch {
        // best-effort
      }
      const screenshotPathDesktop = path.join(SCREENSHOTS_DIR, `${desktopPageId}.png`);
      try {
        await desktopPage.screenshot({ path: screenshotPathDesktop, fullPage: false });
      } catch {
        // best-effort; missing screenshot shouldn't fail the audit
      }
      await desktopPage.close();
      await desktopContext.close();

      if (loadOk) {
        try {
          desktopLighthouse = await runLighthouseMedian(target.url, "desktop", input.config.lighthouseRuns, desktopPageId);
        } catch (err) {
          log(`Lighthouse (desktop) failed for ${target.url}: ${err instanceof Error ? err.message : err}`);
        }
      }

      const cruxDesktop = await fetchCruxSummary({ url: target.url }, "DESKTOP");

      await db.insert(auditPages).values({
        id: desktopPageId,
        auditId,
        url: target.url,
        pageType: target.pageType,
        device: "desktop",
        loadOk,
        loadError,
        httpStatus,
        screenshotPath: screenshotPathDesktop,
        lighthouseJsonPath: desktopLighthouse?.rawReportPath ?? null,
        metrics: desktopLighthouse ? toPageMetrics(desktopLighthouse, input.config.lighthouseRuns) : null,
        headers,
        tls: tlsCache.get(hostname) ?? null,
        crux: cruxDesktop,
      });

      pageResults.push({
        auditPageId: desktopPageId,
        pageUrl: target.url,
        device: "desktop",
        lighthousePerformanceScore: desktopLighthouse?.performanceScore ?? null,
        lighthouseSeoScore: desktopLighthouse?.seoScore ?? null,
        lcpMs: desktopLighthouse?.lcpMs ?? null,
        clsScore: desktopLighthouse?.clsScore ?? null,
        tbtMs: desktopLighthouse?.tbtMs ?? null,
        headerScore: gradeSecurityHeaders(headers, target.url).score,
        findings: loadOk ? [...pageFindings, ...desktopTapFindings] : [],
      });

      // ---- Mobile pass: Lighthouse + device-specific tap target/font checks ----
      if (input.config.devices.includes("mobile") && loadOk) {
        const mobilePageId = randomUUID();
        const mobileContext = await newIsolatedContext(DEVICE_PROFILES.mobile);
        const mobilePage = await mobileContext.newPage();
        let mobileLoadOk = true;
        let mobileLoadError: string | null = null;
        let mobileTapFindings: FindingDraft[] = [];
        const screenshotPathMobile = path.join(SCREENSHOTS_DIR, `${mobilePageId}.png`);

        try {
          const response = await mobilePage.goto(target.url, { waitUntil: "networkidle", timeout: CRAWL_DEFAULTS.perRequestTimeoutMs });
          if (!response || response.status() >= 400) {
            mobileLoadOk = false;
            mobileLoadError = `HTTP ${response?.status() ?? "unknown"}`;
          } else {
            mobileTapFindings = await checkTapTargetsAndFontSizes(mobilePage, target.url);
          }
          await mobilePage.screenshot({ path: screenshotPathMobile, fullPage: false });
        } catch (err) {
          mobileLoadOk = false;
          mobileLoadError = err instanceof Error ? err.message : "Failed to load page";
        } finally {
          await mobilePage.close();
          await mobileContext.close();
        }

        let mobileLighthouse;
        if (mobileLoadOk) {
          try {
            mobileLighthouse = await runLighthouseMedian(target.url, "mobile", input.config.lighthouseRuns, mobilePageId);
          } catch (err) {
            log(`Lighthouse (mobile) failed for ${target.url}: ${err instanceof Error ? err.message : err}`);
          }
        }

        const cruxMobile = await fetchCruxSummary({ url: target.url }, "PHONE");

        await db.insert(auditPages).values({
          id: mobilePageId,
          auditId,
          url: target.url,
          pageType: target.pageType,
          device: "mobile",
          loadOk: mobileLoadOk,
          loadError: mobileLoadError,
          httpStatus,
          screenshotPath: screenshotPathMobile,
          lighthouseJsonPath: mobileLighthouse?.rawReportPath ?? null,
          metrics: mobileLighthouse ? toPageMetrics(mobileLighthouse, input.config.lighthouseRuns) : null,
          headers,
          tls: tlsCache.get(hostname) ?? null,
          crux: cruxMobile,
        });

        pageResults.push({
          auditPageId: mobilePageId,
          pageUrl: target.url,
          device: "mobile",
          lighthousePerformanceScore: mobileLighthouse?.performanceScore ?? null,
          lighthouseSeoScore: mobileLighthouse?.seoScore ?? null,
          lcpMs: mobileLighthouse?.lcpMs ?? null,
          clsScore: mobileLighthouse?.clsScore ?? null,
          tbtMs: mobileLighthouse?.tbtMs ?? null,
          headerScore: null,
          findings: mobileLoadOk ? mobileTapFindings : [],
        });
      }

      await new Promise((r) => setTimeout(r, CRAWL_DEFAULTS.requestDelayMs));
    }

    // ---- Site-wide checks ----
    log("Running site-wide SEO checks (duplicates, local SEO)...");
    sharedFindings.push(...runSiteWideSeoChecks(allSeoFacts, input.isLocalBusiness));

    log("Checking internal links for breaks/redirect chains...");
    sharedFindings.push(...(await checkInternalLinks(linksBySourcePage, 60)));

    if (input.config.checkExposedFiles) {
      log("Checking for accidentally exposed files (.git, .env)...");
      sharedFindings.push(...(await checkExposedFiles(input.baseUrl)));
    }

    if (firstDesktopAuditPageId) {
      const anchor = pageResults.find((p) => p.auditPageId === firstDesktopAuditPageId);
      anchor?.findings.push(...sharedFindings);
    }

    log("Scoring and deduplicating findings...");
    const scores = computeScores(pageResults);
    const findingRows = deduplicateFindings(pageResults, auditId);
    if (findingRows.length > 0) {
      await db.insert(findingsTable).values(findingRows);
    }

    await db
      .update(audits)
      .set({
        status: "done",
        finishedAt: new Date().toISOString(),
        overallScore: scores.overallScore,
        performanceScore: scores.performanceScore,
        seoScore: scores.seoScore,
        accessibilityScore: scores.accessibilityScore,
        securityScore: scores.securityScore,
      })
      .where(eq(audits.id, auditId));

    log("Audit complete.");
    return auditId;
  } catch (err) {
    await db
      .update(audits)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() })
      .where(eq(audits.id, auditId));
    throw err;
  }
}
