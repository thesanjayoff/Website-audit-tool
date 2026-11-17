import * as cheerio from "cheerio";
import { safeFetch } from "../security/ssrf";
import { CRAWL_DEFAULTS } from "../config/thresholds";
import type { FindingDraft } from "./types";

export type SeoPageFacts = {
  pageUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1s: string[];
  headingSequence: number[];
  viewportPresent: boolean;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  jsonLd: Array<{ valid: boolean; type: string | null; error?: string }>;
  hreflangs: string[];
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  imagesMissingAlt: number;
  totalImages: number;
  phoneNumbers: string[];
  addressHints: string[];
};

function textWordCount(html: string): number {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.length === 0 ? 0 : text.split(" ").length;
}

export function extractSeoFacts(html: string, pageUrl: string): SeoPageFacts {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);

  const h1s = $("h1").map((_, el) => $(el).text().trim()).get();
  const headingSequence = $("h1,h2,h3,h4,h5,h6")
    .map((_, el) => Number((el as unknown as { tagName: string }).tagName[1]))
    .get();

  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) ogTags[prop] = content;
  });

  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) twitterTags[name] = content;
  });

  const jsonLd = $('script[type="application/ld+json"]')
    .map((_, el) => {
      const raw = $(el).contents().text();
      try {
        const parsed = JSON.parse(raw);
        const type = Array.isArray(parsed) ? parsed[0]?.["@type"] ?? null : parsed?.["@type"] ?? null;
        return { valid: true, type: type ? String(type) : null };
      } catch (err) {
        return { valid: false, type: null, error: err instanceof Error ? err.message : "Invalid JSON" };
      }
    })
    .get();

  const hreflangs = $('link[rel="alternate"][hreflang]').map((_, el) => $(el).attr("hreflang") ?? "").get();

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === base.origin) internalLinks.push(resolved.toString());
      else externalLinks.push(resolved.toString());
    } catch {
      // ignore malformed href
    }
  });

  const images = $("img");
  const imagesMissingAlt = images.filter((_, el) => !$(el).attr("alt")?.trim() && !$(el).attr("role")?.includes("presentation")).length;

  const bodyText = $("body").text();
  const phoneNumbers = [...new Set((bodyText.match(/(\+?\d[\d\s().-]{7,}\d)/g) ?? []).map((s) => s.replace(/\s+/g, " ").trim()))].slice(0, 5);
  const addressHints = [...new Set((bodyText.match(/\d{1,5}\s+[A-Za-z0-9.\s]{3,40}(street|st\.|avenue|ave\.|road|rd\.|drive|dr\.|lane|ln\.|boulevard|blvd\.)/gi) ?? []))].slice(0, 5);

  return {
    pageUrl,
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    canonical: $('link[rel="canonical"]').attr("href") || null,
    robotsMeta: $('meta[name="robots"]').attr("content") || null,
    h1s,
    headingSequence,
    viewportPresent: $('meta[name="viewport"]').length > 0,
    ogTags,
    twitterTags,
    jsonLd,
    hreflangs,
    wordCount: textWordCount(html),
    internalLinks: [...new Set(internalLinks)],
    externalLinks: [...new Set(externalLinks)],
    imagesMissingAlt,
    totalImages: images.length,
    phoneNumbers,
    addressHints,
  };
}

const THIN_CONTENT_WORD_THRESHOLD = 150;

export function runSeoPageChecks(facts: SeoPageFacts, pageType: string): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const f = (draft: FindingDraft) => findings.push(draft);

  if (!facts.title) {
    f(seoFinding("Missing <title> tag", "There is no <title> element, which is the single most important on-page SEO signal and what shows as the blue link in search results.", "high", facts.pageUrl, "Add a unique, descriptive <title> (roughly 50-60 characters) that includes the page's main topic."));
  } else if (facts.title.length > 60) {
    f(seoFinding(`Title tag is long (${facts.title.length} characters)`, "Titles much longer than ~60 characters often get truncated in search results.", "low", facts.pageUrl, "Shorten the title to the most important ~50-60 characters."));
  } else if (facts.title.length < 15) {
    f(seoFinding(`Title tag is very short (${facts.title.length} characters)`, "A very short title likely isn't descriptive enough to stand out in search results.", "low", facts.pageUrl, "Expand the title to clearly describe the page's content, ideally 30-60 characters."));
  }

  if (!facts.metaDescription) {
    f(seoFinding("Missing meta description", "There's no meta description, so search engines will auto-generate a snippet, which you don't control.", "medium", facts.pageUrl, "Add a compelling, unique meta description (roughly 120-155 characters) summarizing the page."));
  } else if (facts.metaDescription.length > 160) {
    f(seoFinding(`Meta description is long (${facts.metaDescription.length} characters)`, "Long meta descriptions are often truncated in search results.", "low", facts.pageUrl, "Trim the description to roughly 120-155 characters."));
  }

  if (facts.h1s.length === 0) {
    f(seoFinding("Missing <h1>", "No top-level heading was found, which is a strong signal to search engines about the page topic.", "medium", facts.pageUrl, "Add one clear, descriptive <h1> that reflects the page's main subject."));
  } else if (facts.h1s.length > 1) {
    f(seoFinding(`Multiple <h1> tags (${facts.h1s.length})`, "Having more than one <h1> can dilute the page's topical signal, though modern search engines tolerate it better than they used to.", "info", facts.pageUrl, "Use a single <h1> and demote the rest to <h2>+."));
  }

  if (!facts.canonical) {
    f(seoFinding("Missing canonical tag", "Without a canonical tag, search engines must guess which URL variant (with/without trailing slash, query params, etc.) is the authoritative one.", "low", facts.pageUrl, "Add <link rel=\"canonical\" href=\"...\"> pointing to the preferred URL for this content."));
  }

  if (facts.robotsMeta && /noindex/i.test(facts.robotsMeta) && (pageType === "home" || pageType === "listing" || pageType === "detail")) {
    f(seoFinding("Important page is marked noindex", `This ${pageType} page has a robots meta tag of "${facts.robotsMeta}", which tells search engines not to index it. This is often accidental.`, "critical", facts.pageUrl, "Remove the noindex directive unless this page is intentionally excluded from search results."));
  }

  if (!facts.viewportPresent) {
    f(seoFinding("Missing viewport meta tag", "Without a viewport meta tag, mobile browsers can't properly scale the page, which hurts both usability and mobile search ranking signals.", "high", facts.pageUrl, 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
  }

  if (facts.totalImages > 0 && facts.imagesMissingAlt > 0) {
    f(seoFinding(`${facts.imagesMissingAlt} of ${facts.totalImages} image(s) missing alt text`, "Alt text helps both accessibility and image search visibility.", facts.imagesMissingAlt / facts.totalImages > 0.5 ? "medium" : "low", facts.pageUrl, "Add descriptive alt text to every meaningful image; use alt=\"\" for purely decorative images."));
  }

  if (!facts.ogTags["og:title"] || !facts.ogTags["og:description"] || !facts.ogTags["og:image"]) {
    f(seoFinding("Incomplete Open Graph tags", "Missing og:title, og:description, or og:image means links to this page may look broken or generic when shared on social media.", "low", facts.pageUrl, "Add og:title, og:description, og:image, and og:url for clean social share previews."));
  }

  const invalidJsonLd = facts.jsonLd.filter((j) => !j.valid);
  if (invalidJsonLd.length > 0) {
    f(seoFinding(`Invalid JSON-LD structured data (${invalidJsonLd.length} block(s))`, "The page includes structured data that isn't valid JSON, so search engines will likely ignore or fail to parse it.", "medium", facts.pageUrl, "Fix the JSON syntax, or validate with Google's Rich Results Test before publishing."));
  }

  if (pageType !== "other" && facts.wordCount > 0 && facts.wordCount < THIN_CONTENT_WORD_THRESHOLD) {
    f(seoFinding(`Thin content (~${facts.wordCount} words)`, `This page has noticeably little text content (about ${facts.wordCount} words), which can make it harder for search engines to understand what it's about.`, "low", facts.pageUrl, "Consider expanding the page with more substantive, useful content for visitors — not just keyword padding."));
  }

  return findings;
}

function seoFinding(
  title: string,
  explanation: string,
  severity: FindingDraft["severity"],
  pageUrl: string,
  fixSuggestion: string,
): FindingDraft {
  return {
    category: "seo",
    engine: "seo-checks",
    title,
    explanation,
    businessImpact: "SEO issues like this can reduce how easily potential customers find the site in search results, which over time means less organic traffic and fewer leads/sales.",
    severity,
    effort: "low",
    impact: severity === "critical" || severity === "high" ? "high" : "medium",
    evidence: [{ pageUrl }],
    fixSuggestion,
    wcagCriteria: [],
    groupKeyOverride: `seo-checks:${title.replace(/\(.*?\)/g, "").trim()}`,
  };
}

/** Cross-page checks that need the full set of crawled pages: duplicates, broken links, local SEO NAP consistency. */
export function runSiteWideSeoChecks(allFacts: SeoPageFacts[], isLocalBusiness: boolean): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const byTitle = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();
  for (const facts of allFacts) {
    if (facts.title) byTitle.set(facts.title, [...(byTitle.get(facts.title) ?? []), facts.pageUrl]);
    if (facts.metaDescription) byDescription.set(facts.metaDescription, [...(byDescription.get(facts.metaDescription) ?? []), facts.pageUrl]);
  }
  for (const [title, urls] of byTitle) {
    if (urls.length > 1) {
      findings.push({
        category: "seo",
        engine: "seo-checks",
        title: `Duplicate <title> across ${urls.length} pages`,
        explanation: `The exact title "${title}" is used on ${urls.length} different pages, so search engines can't tell them apart by title alone.`,
        businessImpact: "Duplicate titles make it harder for both search engines and visitors to distinguish between pages, diluting ranking potential.",
        severity: "medium",
        effort: "low",
        impact: "medium",
        evidence: urls.map((u) => ({ pageUrl: u })),
        fixSuggestion: "Give each page a unique, specific title.",
        wcagCriteria: [],
        groupKeyOverride: `seo-checks:duplicate-title:${title}`,
      });
    }
  }
  for (const [desc, urls] of byDescription) {
    if (urls.length > 1) {
      findings.push({
        category: "seo",
        engine: "seo-checks",
        title: `Duplicate meta description across ${urls.length} pages`,
        explanation: `The same meta description is used on ${urls.length} different pages.`,
        businessImpact: "Duplicate descriptions reduce the distinctiveness of each page's search snippet.",
        severity: "low",
        effort: "low",
        impact: "low",
        evidence: urls.map((u) => ({ pageUrl: u })),
        fixSuggestion: "Write a unique meta description for each page.",
        wcagCriteria: [],
        groupKeyOverride: `seo-checks:duplicate-description:${desc.slice(0, 40)}`,
      });
    }
  }

  if (isLocalBusiness) {
    const allPhones = new Set(allFacts.flatMap((f) => f.phoneNumbers));
    if (allPhones.size > 1) {
      findings.push({
        category: "seo",
        engine: "local-seo-checks",
        title: `Inconsistent phone number across pages (${allPhones.size} variants found)`,
        explanation: `Found ${allPhones.size} different phone number formats/values across the site: ${[...allPhones].slice(0, 5).join(", ")}.`,
        businessImpact: "Inconsistent Name/Address/Phone (NAP) details hurt local search rankings and confuse potential customers about which number to call.",
        severity: "medium",
        effort: "low",
        impact: "medium",
        evidence: allFacts.filter((f) => f.phoneNumbers.length > 0).map((f) => ({ pageUrl: f.pageUrl, value: f.phoneNumbers.join(", ") })),
        fixSuggestion: "Standardize on one phone number format and use it identically everywhere, matching your Google Business Profile exactly.",
        wcagCriteria: [],
        groupKeyOverride: "local-seo-checks:nap-phone-inconsistent",
      });
    }
    const hasAnyAddress = allFacts.some((f) => f.addressHints.length > 0);
    if (!hasAnyAddress) {
      findings.push({
        category: "seo",
        engine: "local-seo-checks",
        title: "No postal address detected on the site",
        explanation: "None of the crawled pages appear to contain a recognizable street address.",
        businessImpact: "Local businesses typically need a visible, consistent address for local SEO (NAP) signals and for Google Business Profile matching.",
        severity: "low",
        effort: "low",
        impact: "medium",
        evidence: [{ pageUrl: allFacts[0]?.pageUrl ?? "" }],
        fixSuggestion: "Add a clear, consistent postal address, typically in the footer and on a dedicated contact page, matching your Google Business Profile.",
        wcagCriteria: [],
        groupKeyOverride: "local-seo-checks:no-address",
      });
    }
  }

  return findings;
}

export type LinkCheckResult = { url: string; status: number | null; ok: boolean; redirectChainLength: number; sourcePage: string };

/** Checks a sample of internal links for brokenness/redirect chains (capped to stay polite). */
export async function checkInternalLinks(
  linksBySourcePage: Map<string, string[]>,
  maxLinksToCheck: number,
): Promise<FindingDraft[]> {
  const checked = new Set<string>();
  const results: LinkCheckResult[] = [];

  outer: for (const [sourcePage, links] of linksBySourcePage) {
    for (const link of links) {
      if (checked.size >= maxLinksToCheck) break outer;
      if (checked.has(link)) continue;
      checked.add(link);
      try {
        const res = await safeFetch(link, { userAgent: CRAWL_DEFAULTS.userAgent, timeoutMs: 10_000, method: "GET" });
        results.push({ url: link, status: res.status, ok: res.ok, redirectChainLength: res.redirectChain.length, sourcePage });
      } catch {
        results.push({ url: link, status: null, ok: false, redirectChainLength: 0, sourcePage });
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const findings: FindingDraft[] = [];
  const broken = results.filter((r) => !r.ok);
  if (broken.length > 0) {
    findings.push({
      category: "seo",
      engine: "link-check",
      title: `${broken.length} broken internal link(s) found`,
      explanation: `Checked ${results.length} internal links; ${broken.length} returned an error or could not be reached.`,
      businessImpact: "Broken links create dead ends for visitors and waste the crawl budget search engines spend on the site.",
      severity: broken.length > 5 ? "high" : "medium",
      effort: "low",
      impact: "medium",
      evidence: broken.slice(0, 10).map((b) => ({ pageUrl: b.sourcePage, value: `${b.url} -> ${b.status ?? "unreachable"}` })),
      fixSuggestion: "Fix or remove each broken link; redirect moved content with a 301 to its new location.",
      wcagCriteria: [],
      groupKeyOverride: "link-check:broken-links",
    });
  }
  const chained = results.filter((r) => r.redirectChainLength > 1);
  if (chained.length > 0) {
    findings.push({
      category: "seo",
      engine: "link-check",
      title: `${chained.length} internal link(s) go through a redirect chain`,
      explanation: "Some internal links redirect more than once before reaching their final destination.",
      businessImpact: "Redirect chains slow down page loads and waste a small amount of search-engine crawl efficiency.",
      severity: "low",
      effort: "low",
      impact: "low",
      evidence: chained.slice(0, 10).map((c) => ({ pageUrl: c.sourcePage, value: c.url })),
      fixSuggestion: "Point links directly at the final URL instead of through intermediate redirects.",
      wcagCriteria: [],
      groupKeyOverride: "link-check:redirect-chains",
    });
  }
  return findings;
}
