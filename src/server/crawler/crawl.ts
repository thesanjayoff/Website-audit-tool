import { discoverSitemapUrls, discoverUrlsFromSitemaps, fetchRobotsTxt, makeRobotsChecker } from "./discover";
import { classifyPage, PAGE_TYPE_PRIORITY, type PageType } from "./classify";
import { newIsolatedContext } from "../browser/chromium";
import { CRAWL_DEFAULTS } from "../config/thresholds";
import { assertUrlIsAuditable, SsrfBlockedError } from "../security/ssrf";

export type DiscoveredPage = {
  url: string;
  pageType: PageType;
  title: string | null;
  loadOk: boolean;
  loadError: string | null;
  httpStatus: number | null;
  discoveredVia: "sitemap" | "link";
};

export type DiscoveryResult = {
  pages: DiscoveredPage[];
  robotsAllowsAll: boolean;
  robotsExists: boolean;
  sitemapFound: boolean;
  blockedUrls: Array<{ url: string; reason: string }>;
};

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = "";
    // Strip common tracking params that would otherwise create spurious "distinct" pages.
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const p of stripParams) u.searchParams.delete(p);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString().replace(/\/$/, "") || u.origin;
  } catch {
    return null;
  }
}

/**
 * Discovers candidate pages for a site: seeds from the sitemap (if present),
 * then does a polite, rate-limited, same-origin BFS crawl with a headless
 * browser (so JS-rendered sites are handled) up to `maxPages`, respecting
 * robots.txt. Pages that fail to load are still returned, flagged, so the
 * UI can show them rather than silently dropping them.
 */
export async function discoverPages(
  baseUrl: string,
  maxPages: number = CRAWL_DEFAULTS.maxPages,
): Promise<DiscoveryResult> {
  await assertUrlIsAuditable(baseUrl);

  const userAgent = CRAWL_DEFAULTS.userAgent;
  const robots = await fetchRobotsTxt(baseUrl, userAgent);
  const isAllowed = makeRobotsChecker(robots.raw, baseUrl);
  const blockedUrls: Array<{ url: string; reason: string }> = [];

  const sitemapCandidates = await discoverSitemapUrls(baseUrl, userAgent);
  const sitemapUrls = await discoverUrlsFromSitemaps(sitemapCandidates, userAgent, maxPages * 3);
  const sitemapFound = sitemapUrls.length > 0;

  const visited = new Set<string>();
  const results: DiscoveredPage[] = [];
  const queue: Array<{ url: string; via: "sitemap" | "link"; depth: number }> = [];

  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  if (normalizedBase) queue.push({ url: normalizedBase, via: "link", depth: 0 });
  for (const u of sitemapUrls) {
    const n = normalizeUrl(u, baseUrl);
    if (n && sameOrigin(n, baseUrl)) queue.push({ url: n, via: "sitemap", depth: 0 });
  }

  const context = await newIsolatedContext({
    viewport: { width: 1366, height: 900 },
    userAgent,
  });

  try {
    while (queue.length > 0 && results.length < maxPages) {
      // Prioritize by page type so home/listing/detail/form/contact/content
      // win over arbitrary "other" pages when the queue exceeds the budget.
      queue.sort((a, b) => {
        const pa = classifyPage({ url: a.url, baseUrl, depth: a.depth });
        const pb = classifyPage({ url: b.url, baseUrl, depth: b.depth });
        return PAGE_TYPE_PRIORITY[pa] - PAGE_TYPE_PRIORITY[pb] || a.depth - b.depth;
      });

      const next = queue.shift();
      if (!next) break;
      if (visited.has(next.url)) continue;
      visited.add(next.url);

      if (!isAllowed(next.url)) {
        blockedUrls.push({ url: next.url, reason: "disallowed by robots.txt" });
        continue;
      }

      try {
        await assertUrlIsAuditable(next.url);
      } catch (err) {
        blockedUrls.push({ url: next.url, reason: err instanceof Error ? err.message : "blocked" });
        continue;
      }

      const page = await context.newPage();
      let loadOk = true;
      let loadError: string | null = null;
      let httpStatus: number | null = null;
      let title: string | null = null;
      let links: string[] = [];

      try {
        const response = await page.goto(next.url, {
          waitUntil: "networkidle",
          timeout: CRAWL_DEFAULTS.perRequestTimeoutMs,
        });
        httpStatus = response?.status() ?? null;
        if (!response || response.status() >= 400) {
          loadOk = false;
          loadError = `HTTP ${httpStatus ?? "unknown"}`;
        }
        title = await page.title();
        if (next.depth < 3 && results.length + queue.length < maxPages * 4) {
          links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
        }
      } catch (err) {
        loadOk = false;
        loadError = err instanceof Error ? err.message : "Failed to load page";
      } finally {
        await page.close();
      }

      results.push({
        url: next.url,
        pageType: classifyPage({ url: next.url, baseUrl, depth: next.depth }),
        title,
        loadOk,
        loadError,
        httpStatus,
        discoveredVia: next.via,
      });

      for (const link of links) {
        const normalized = normalizeUrl(link, next.url);
        if (!normalized) continue;
        if (!sameOrigin(normalized, baseUrl)) continue;
        if (visited.has(normalized)) continue;
        if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|docx?|xlsx?|mp4|webp|ico|css|js)$/i.test(new URL(normalized).pathname)) continue;
        queue.push({ url: normalized, via: "link", depth: next.depth + 1 });
      }

      // Polite rate limit: same-origin requests only, so a flat delay is fine.
      await new Promise((r) => setTimeout(r, CRAWL_DEFAULTS.requestDelayMs));
    }
  } finally {
    await context.close();
  }

  return {
    pages: results,
    robotsAllowsAll: robots.allowsAll,
    robotsExists: robots.exists,
    sitemapFound,
    blockedUrls,
  };
}

export { SsrfBlockedError };
