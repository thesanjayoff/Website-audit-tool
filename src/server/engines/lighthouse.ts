import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as chromeLauncher from "chrome-launcher";
import lighthouse, { type Flags } from "lighthouse";
import { chromiumExecutablePath } from "../browser/chromium";
import { RAW_DIR } from "../db/client";
import type { PageMetrics } from "../db/schema";

export const LIGHTHOUSE_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("lighthouse/package.json").version as string;
  } catch {
    return "unknown";
  }
})();

type Device = "mobile" | "desktop";

// Mirrors Lighthouse CLI's built-in mobile/desktop presets so scores match
// what `lighthouse --preset=desktop` would produce.
const SCREEN_EMULATION = {
  mobile: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625, disabled: false },
  desktop: { mobile: false, width: 1366, height: 768, deviceScaleFactor: 1, disabled: false },
} as const;

const THROTTLING = {
  mobile: undefined, // use Lighthouse's default simulated mobile throttling
  desktop: {
    rttMs: 40,
    throughputKbps: 10 * 1024,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
} as const;

export type LighthouseRunSummary = {
  performanceScore: number | null;
  seoScore: number | null;
  bestPracticesScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndex: number | null;
  ttfbMs: number | null;
  lcpElement: string | null;
  diagnostics: LighthouseDiagnostics;
  rawReportPath: string;
};

export type LighthouseDiagnostics = {
  unusedJsBytes: number;
  unusedCssBytes: number;
  renderBlockingRequests: number;
  oversizedImages: Array<{ url: string; wastedBytes: number }>;
  nonCompositedAnimations: number;
  usesCaching: boolean;
  usesCompression: boolean;
  thirdPartySummaryMs: number;
  serverResponseTimeMs: number | null;
  layoutShiftCulprits: string[];
};

function median(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

async function runOnce(url: string, device: Device): Promise<{ summary: Omit<LighthouseRunSummary, "rawReportPath" | "diagnostics">; diagnostics: LighthouseDiagnostics; lhr: unknown }> {
  const chrome = await chromeLauncher.launch({
    chromePath: chromiumExecutablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const flags: Flags = {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "seo", "best-practices"],
      formFactor: device,
      screenEmulation: SCREEN_EMULATION[device],
      throttlingMethod: device === "desktop" ? "devtools" : "simulate",
      ...(THROTTLING[device] ? { throttling: THROTTLING[device] } : {}),
    };

    const runnerResult = await lighthouse(url, flags);
    if (!runnerResult) throw new Error("Lighthouse produced no result");
    const lhr = runnerResult.lhr;
    const audits = lhr.audits;

    const diagnostics: LighthouseDiagnostics = {
      unusedJsBytes: audits["unused-javascript"]?.details && "overallSavingsBytes" in audits["unused-javascript"].details
        ? Number((audits["unused-javascript"].details as { overallSavingsBytes?: number }).overallSavingsBytes ?? 0)
        : 0,
      unusedCssBytes: audits["unused-css-rules"]?.details && "overallSavingsBytes" in audits["unused-css-rules"].details
        ? Number((audits["unused-css-rules"].details as { overallSavingsBytes?: number }).overallSavingsBytes ?? 0)
        : 0,
      renderBlockingRequests: Array.isArray((audits["render-blocking-resources"]?.details as { items?: unknown[] } | undefined)?.items)
        ? ((audits["render-blocking-resources"]!.details as { items: unknown[] }).items.length)
        : 0,
      oversizedImages: extractOversizedImages(audits["uses-optimized-images"] ?? audits["modern-image-formats"]),
      nonCompositedAnimations: Array.isArray((audits["non-composited-animations"]?.details as { items?: unknown[] } | undefined)?.items)
        ? ((audits["non-composited-animations"]!.details as { items: unknown[] }).items.length)
        : 0,
      usesCaching: (audits["uses-long-cache-ttl"]?.score ?? 1) >= 0.9,
      usesCompression: (audits["uses-text-compression"]?.score ?? 1) >= 0.9,
      thirdPartySummaryMs: Number((audits["third-party-summary"]?.details as { summary?: { wastedMs?: number } } | undefined)?.summary?.wastedMs ?? 0),
      serverResponseTimeMs: audits["server-response-time"]?.numericValue ?? null,
      layoutShiftCulprits: extractLayoutShiftCulprits(audits["layout-shift-elements"]),
    };

    return {
      summary: {
        performanceScore: lhr.categories.performance?.score != null ? lhr.categories.performance.score * 100 : null,
        seoScore: lhr.categories.seo?.score != null ? lhr.categories.seo.score * 100 : null,
        bestPracticesScore: lhr.categories["best-practices"]?.score != null ? lhr.categories["best-practices"].score * 100 : null,
        lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
        clsScore: audits["cumulative-layout-shift"]?.numericValue ?? null,
        tbtMs: audits["total-blocking-time"]?.numericValue ?? null,
        fcpMs: audits["first-contentful-paint"]?.numericValue ?? null,
        speedIndex: audits["speed-index"]?.numericValue ?? null,
        ttfbMs: audits["server-response-time"]?.numericValue ?? null,
        lcpElement: extractLcpElement(audits["largest-contentful-paint-element"]),
      },
      diagnostics,
      lhr,
    };
  } finally {
    await chrome.kill();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOversizedImages(audit: any): Array<{ url: string; wastedBytes: number }> {
  const items = audit?.details?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item: { url?: string; wastedBytes?: number }) => ({ url: item.url ?? "unknown", wastedBytes: item.wastedBytes ?? 0 }))
    .filter((i: { wastedBytes: number }) => i.wastedBytes > 0)
    .slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLayoutShiftCulprits(audit: any): string[] {
  const items = audit?.details?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item: { node?: { snippet?: string } }) => item.node?.snippet)
    .filter((s: unknown): s is string => typeof s === "string")
    .slice(0, 5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLcpElement(audit: any): string | null {
  const items = audit?.details?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[0]?.node?.snippet ?? items[0]?.node?.selector ?? null;
}

/**
 * Runs Lighthouse `runs` times (default 3) against `url` for the given device
 * profile and returns the median of each numeric metric, since individual
 * runs vary. The score is reported as that median, never a single run.
 */
export async function runLighthouseMedian(
  url: string,
  device: Device,
  runs: number,
  auditPageId: string,
): Promise<LighthouseRunSummary> {
  const results: Array<Awaited<ReturnType<typeof runOnce>>> = [];
  for (let i = 0; i < runs; i++) {
    results.push(await runOnce(url, device));
  }

  const rawReportPath = path.join(RAW_DIR, `lighthouse-${auditPageId}-${device}-${randomUUID()}.json`);
  await writeFile(rawReportPath, JSON.stringify(results.map((r) => r.lhr)), "utf-8");

  const pick = <K extends keyof LighthouseRunSummary>(key: K) =>
    median(results.map((r) => r.summary[key as keyof typeof r.summary] as number | null).filter((v): v is number => v != null));

  // Use the median-performance run's diagnostics (closest to the representative run).
  const perfScores = results.map((r) => r.summary.performanceScore ?? 0);
  const medianIdx = perfScores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => a.score - b.score)[Math.floor(results.length / 2)]?.idx ?? 0;

  return {
    performanceScore: pick("performanceScore"),
    seoScore: pick("seoScore"),
    bestPracticesScore: pick("bestPracticesScore"),
    lcpMs: pick("lcpMs"),
    clsScore: pick("clsScore"),
    tbtMs: pick("tbtMs"),
    fcpMs: pick("fcpMs"),
    speedIndex: pick("speedIndex"),
    ttfbMs: pick("ttfbMs"),
    lcpElement: results[medianIdx]?.summary.lcpElement ?? null,
    diagnostics: results[medianIdx]!.diagnostics,
    rawReportPath,
  };
}

export function toPageMetrics(summary: LighthouseRunSummary, runsUsed: number): PageMetrics {
  return {
    lab: {
      lighthousePerformanceScore: summary.performanceScore,
      lighthouseSeoScore: summary.seoScore,
      lighthouseBestPracticesScore: summary.bestPracticesScore,
      lcpMs: summary.lcpMs,
      clsScore: summary.clsScore,
      tbtMs: summary.tbtMs,
      fcpMs: summary.fcpMs,
      speedIndex: summary.speedIndex,
      ttfbMs: summary.ttfbMs,
      lcpElement: summary.lcpElement,
      runsUsed,
    },
  };
}
