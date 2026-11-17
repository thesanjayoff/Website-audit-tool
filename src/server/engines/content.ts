import type { Page } from "playwright";
import * as cheerio from "cheerio";
import { safeFetch } from "../security/ssrf";
import { CRAWL_DEFAULTS } from "../config/thresholds";
import type { FindingDraft } from "./types";

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const vowelGroups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

export type ReadabilityResult = { fleschScore: number | null; gradeLevel: string; wordCount: number };

export function computeReadability(html: string): ReadabilityResult {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  if (!text) return { fleschScore: null, gradeLevel: "unknown", wordCount: 0 };

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 30 || sentences.length === 0) {
    return { fleschScore: null, gradeLevel: "not enough text to assess", wordCount: words.length };
  }

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  const rounded = Math.round(score * 10) / 10;

  let gradeLevel: string;
  if (rounded >= 90) gradeLevel = "very easy (5th grade)";
  else if (rounded >= 70) gradeLevel = "easy (7th grade)";
  else if (rounded >= 60) gradeLevel = "plain English (8th-9th grade)";
  else if (rounded >= 50) gradeLevel = "fairly difficult (10th-12th grade)";
  else if (rounded >= 30) gradeLevel = "difficult (college level)";
  else gradeLevel = "very difficult (college graduate level)";

  return { fleschScore: rounded, gradeLevel, wordCount: words.length };
}

export function readabilityFinding(result: ReadabilityResult, pageUrl: string): FindingDraft | null {
  if (result.fleschScore === null || result.fleschScore >= 50) return null;
  return {
    category: "content",
    engine: "readability",
    title: `Text may be hard to read (Flesch score ${result.fleschScore}, ${result.gradeLevel})`,
    explanation: "The Flesch Reading Ease score estimates how easy the page's text is to read based on sentence and word length. Lower scores mean denser, harder-to-read text.",
    businessImpact: "If visitors find the copy hard to follow, they're more likely to leave without understanding the offer or taking action.",
    severity: "low",
    effort: "medium",
    impact: "low",
    evidence: [{ pageUrl, value: String(result.fleschScore) }],
    fixSuggestion: "Shorten sentences, prefer plain words over jargon, and break up long paragraphs.",
    wcagCriteria: [],
    groupKeyOverride: "readability:low-score",
  };
}

export async function checkBrokenImagesAndFavicon(page: Page, pageUrl: string): Promise<FindingDraft[]> {
  const findings: FindingDraft[] = [];

  const brokenImages = await page.evaluate(() => {
    return [...document.querySelectorAll("img")]
      .filter((img) => img.src && img.complete && img.naturalWidth === 0)
      .map((img) => img.src)
      .slice(0, 10);
  });

  if (brokenImages.length > 0) {
    findings.push({
      category: "content",
      engine: "content-checks",
      title: `${brokenImages.length} broken image(s) found`,
      explanation: "These <img> elements failed to load any actual image data.",
      businessImpact: "Broken images look unprofessional and can undermine trust, especially on product or portfolio pages.",
      severity: "medium",
      effort: "low",
      impact: "medium",
      evidence: brokenImages.map((src) => ({ pageUrl, value: src })),
      fixSuggestion: "Fix the image URLs or re-upload the missing assets.",
      wcagCriteria: [],
      groupKeyOverride: "content-checks:broken-images",
    });
  }

  const hasFaviconLink = await page.evaluate(() => !!document.querySelector('link[rel*="icon"]'));
  if (!hasFaviconLink) {
    try {
      const faviconUrl = new URL("/favicon.ico", pageUrl).toString();
      const res = await safeFetch(faviconUrl, { userAgent: CRAWL_DEFAULTS.userAgent, timeoutMs: 8000 });
      if (!res.ok) {
        findings.push(missingFaviconFinding(pageUrl));
      }
    } catch {
      findings.push(missingFaviconFinding(pageUrl));
    }
  }

  return findings;
}

function missingFaviconFinding(pageUrl: string): FindingDraft {
  return {
    category: "content",
    engine: "content-checks",
    title: "Missing favicon",
    explanation: "No <link rel=\"icon\"> was found and /favicon.ico is not reachable either.",
    businessImpact: "A missing favicon makes browser tabs and bookmarks look unbranded and slightly unfinished.",
    severity: "info",
    effort: "low",
    impact: "low",
    evidence: [{ pageUrl }],
    fixSuggestion: 'Add a favicon and reference it with <link rel="icon" href="/favicon.ico">.',
    wcagCriteria: [],
    groupKeyOverride: "content-checks:missing-favicon",
  };
}

export async function checkTapTargetsAndFontSizes(page: Page, pageUrl: string): Promise<FindingDraft[]> {
  const findings: FindingDraft[] = [];

  const data = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll("a, button, input, select, textarea")];
    const small = interactive.filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return false;
      return rect.width < 24 || rect.height < 24;
    });

    const textEls = [...document.querySelectorAll("p, li, span, a")].filter((el) => (el.textContent ?? "").trim().length > 10);
    const tinyTextCount = textEls.filter((el) => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      return size > 0 && size < 12;
    }).length;

    return {
      smallTargetCount: small.length,
      smallTargetSamples: small.slice(0, 3).map((el) => el.outerHTML.slice(0, 150)),
      tinyTextCount,
      totalTextEls: textEls.length,
    };
  });

  if (data.smallTargetCount > 0) {
    findings.push({
      category: "content",
      engine: "content-checks",
      title: `${data.smallTargetCount} tap target(s) smaller than the recommended 24x24px minimum`,
      explanation: "Small buttons/links are harder to tap accurately on touchscreens, especially for users with limited dexterity.",
      businessImpact: "Visitors on mobile may mis-tap or give up trying to use small controls, hurting conversions.",
      severity: "low",
      effort: "low",
      impact: "medium",
      evidence: data.smallTargetSamples.map((s) => ({ pageUrl, snippet: s })),
      fixSuggestion: "Increase tap target size to at least 24x24 CSS pixels, with adequate spacing between adjacent targets.",
      wcagCriteria: ["2.5.8"],
      groupKeyOverride: "content-checks:small-tap-targets",
    });
  }

  if (data.totalTextEls > 0 && data.tinyTextCount / data.totalTextEls > 0.2) {
    findings.push({
      category: "content",
      engine: "content-checks",
      title: "A significant portion of text is smaller than 12px",
      explanation: `${data.tinyTextCount} of ${data.totalTextEls} sampled text elements render below 12px.`,
      businessImpact: "Very small text is hard to read, particularly for older visitors or anyone on a small screen.",
      severity: "low",
      effort: "low",
      impact: "low",
      evidence: [{ pageUrl }],
      fixSuggestion: "Set a minimum body font size of around 16px (never below 12px) and scale headings up from there.",
      wcagCriteria: [],
      groupKeyOverride: "content-checks:tiny-text",
    });
  }

  return findings;
}

export function checkContactInfoPresence(
  facts: { phoneNumbers: string[]; addressHints: string[]; pageUrl: string },
  html: string,
): FindingDraft[] {
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(html);
  const hasPhone = facts.phoneNumbers.length > 0;
  if (!hasEmail && !hasPhone) {
    return [{
      category: "content",
      engine: "content-checks",
      title: "No contact information (email or phone) detected on this page",
      explanation: "Neither an email address nor a phone number pattern was found in the page content.",
      businessImpact: "Visitors who are ready to reach out may leave if they can't quickly find a way to contact the business.",
      severity: "info",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl: facts.pageUrl }],
      fixSuggestion: "Make contact details (phone, email, or a contact form link) visible, typically in the header or footer.",
      wcagCriteria: [],
      groupKeyOverride: "content-checks:no-contact-info",
    }];
  }
  return [];
}
