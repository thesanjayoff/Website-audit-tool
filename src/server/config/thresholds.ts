/**
 * Central, documented config for thresholds used across the audit engines.
 * Keep this the single source of truth so the report's "methodology" section
 * can point here, and so operators can tune it without touching engine code.
 *
 * Core Web Vitals thresholds are Google's published "good" boundaries as of
 * late 2025 (web.dev/articles/defining-core-web-vitals-thresholds). Re-check
 * https://web.dev/articles/vitals-cwv before changing these.
 */
export const CORE_WEB_VITALS_THRESHOLDS = {
  lcpMs: { good: 2500, poor: 4000 },
  inpMs: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  // TBT has no official CWV threshold (it's a lab-only proxy for INP, not a
  // CWV metric itself). Lighthouse's own scoring curve uses these boundaries.
  tbtMs: { good: 200, poor: 600 },
} as const;

export type CwvRating = "good" | "needs-improvement" | "poor";

export function rateMetric(
  value: number | null,
  thresholds: { good: number; poor: number },
): CwvRating | "unknown" {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

export const CRAWL_DEFAULTS = {
  maxPages: 20,
  maxConcurrency: 3,
  lighthouseRuns: 3,
  requestDelayMs: 500, // polite rate limit between requests to the same host
  perRequestTimeoutMs: 20_000,
  userAgent:
    "WebsiteAuditToolBot/1.0 (+local agency audit tool; passive checks only; run with site-owner permission)",
  devices: ["mobile", "desktop"] as const,
};

export const SECURITY_HEADER_WEIGHTS = {
  // Loosely mirrors Mozilla HTTP Observatory's grading buckets, reimplemented
  // independently rather than calling the hosted API by default (no network
  // dependency, no rate limit). See docs/security-header-grading.md for the
  // full rationale and the MDN Observatory rules this draws on.
  "content-security-policy": 20,
  "strict-transport-security": 15,
  "x-content-type-options": 10,
  "x-frame-options-or-frame-ancestors": 15,
  "referrer-policy": 10,
  "permissions-policy": 10,
  "cookie-flags": 15,
  "cross-origin-opener-policy": 5,
} as const;

export const CERT_EXPIRY_WARNING_DAYS = 21;
