import robotsParser from "robots-parser";
import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "../security/ssrf";
import { CRAWL_DEFAULTS } from "../config/thresholds";

export type RobotsInfo = {
  exists: boolean;
  allowsAll: boolean;
  sitemapUrls: string[];
  raw: string | null;
};

export async function fetchRobotsTxt(baseUrl: string, userAgent: string): Promise<RobotsInfo> {
  const robotsUrl = new URL("/robots.txt", baseUrl).toString();
  try {
    const res = await safeFetch(robotsUrl, { userAgent, timeoutMs: CRAWL_DEFAULTS.perRequestTimeoutMs });
    if (!res.ok) {
      return { exists: false, allowsAll: true, sitemapUrls: [], raw: null };
    }
    const parser = robotsParser(robotsUrl, res.body);
    const sitemapUrls = parser.getSitemaps();
    return {
      exists: true,
      allowsAll: parser.isAllowed(baseUrl, userAgent) !== false,
      sitemapUrls,
      raw: res.body,
    };
  } catch {
    return { exists: false, allowsAll: true, sitemapUrls: [], raw: null };
  }
}

export function makeRobotsChecker(raw: string | null, baseUrl: string) {
  if (!raw) {
    return (_url: string) => true;
  }
  const parser = robotsParser(new URL("/robots.txt", baseUrl).toString(), raw);
  return (url: string) => parser.isAllowed(url, CRAWL_DEFAULTS.userAgent) !== false;
}

/** Recursively expands sitemap indexes, capped to avoid runaway fetches. */
export async function discoverUrlsFromSitemaps(
  sitemapUrls: string[],
  userAgent: string,
  maxUrls: number,
): Promise<string[]> {
  const parser = new XMLParser({ ignoreAttributes: false });
  const found = new Set<string>();
  const queue = [...sitemapUrls];
  const visitedSitemaps = new Set<string>();

  while (queue.length > 0 && found.size < maxUrls) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);
    if (visitedSitemaps.size > 25) break; // sanity cap on sitemap-of-sitemaps depth

    try {
      const res = await safeFetch(sitemapUrl, { userAgent, timeoutMs: CRAWL_DEFAULTS.perRequestTimeoutMs });
      if (!res.ok) continue;
      const xml = parser.parse(res.body);

      const sitemapIndex = xml?.sitemapindex?.sitemap;
      if (sitemapIndex) {
        const entries = Array.isArray(sitemapIndex) ? sitemapIndex : [sitemapIndex];
        for (const entry of entries) {
          if (entry?.loc) queue.push(String(entry.loc));
        }
        continue;
      }

      const urlset = xml?.urlset?.url;
      if (urlset) {
        const entries = Array.isArray(urlset) ? urlset : [urlset];
        for (const entry of entries) {
          if (entry?.loc) found.add(String(entry.loc).trim());
          if (found.size >= maxUrls) break;
        }
      }
    } catch {
      // ignore unreachable/invalid sitemap, continue with what we have
    }
  }

  return [...found];
}

export async function discoverSitemapUrls(baseUrl: string, userAgent: string): Promise<string[]> {
  // Fall back to the conventional /sitemap.xml location if robots.txt didn't list one.
  const robots = await fetchRobotsTxt(baseUrl, userAgent);
  const candidates = robots.sitemapUrls.length > 0
    ? robots.sitemapUrls
    : [new URL("/sitemap.xml", baseUrl).toString()];
  return candidates;
}
