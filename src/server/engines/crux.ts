import { rateMetric, CORE_WEB_VITALS_THRESHOLDS } from "../config/thresholds";
import type { CruxSummary } from "../db/schema";

/**
 * Chrome UX Report API (field data) + CrUX History API (trends).
 * Docs: https://developer.chrome.com/docs/crux/api
 * We deliberately do NOT use PageSpeed Insights' bundled CrUX data — Google
 * has signaled PSI's field-data passthrough is going away, so we hit the
 * CrUX API directly with our own key.
 */

const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const CRUX_HISTORY_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

const METRIC_KEYS = [
  "largest_contentful_paint",
  "cumulative_layout_shift",
  "interaction_to_next_paint",
  "first_contentful_paint",
  "experimental_time_to_first_byte",
] as const;

type CruxApiMetric = {
  percentiles?: { p75: number };
  histogramTimeseries?: unknown;
};

type CruxApiResponse = {
  record?: {
    key: Record<string, string>;
    metrics: Partial<Record<(typeof METRIC_KEYS)[number], CruxApiMetric>>;
    collectionPeriod?: { firstDate: { year: number; month: number; day: number }; lastDate: { year: number; month: number; day: number } };
  };
  error?: { code: number; message: string };
};

function formatDate(d: { year: number; month: number; day: number } | undefined): string {
  if (!d) return "unknown";
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function rateCruxMetric(key: (typeof METRIC_KEYS)[number], p75: number): "good" | "needs-improvement" | "poor" {
  switch (key) {
    case "largest_contentful_paint":
      return rateMetric(p75, CORE_WEB_VITALS_THRESHOLDS.lcpMs) as "good" | "needs-improvement" | "poor";
    case "cumulative_layout_shift":
      // CrUX reports CLS * 1000 as an integer score in the API; actual CLS is p75/1000.
      return rateMetric(p75 / 1000, CORE_WEB_VITALS_THRESHOLDS.cls) as "good" | "needs-improvement" | "poor";
    case "interaction_to_next_paint":
      return rateMetric(p75, CORE_WEB_VITALS_THRESHOLDS.inpMs) as "good" | "needs-improvement" | "poor";
    default:
      return "good";
  }
}

async function callCrux(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<CruxApiResponse> {
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as CruxApiResponse;
  return json;
}

export async function fetchCruxSummary(
  target: { url?: string; origin?: string },
  formFactor: "PHONE" | "DESKTOP" | "ALL_FORM_FACTORS" = "ALL_FORM_FACTORS",
): Promise<CruxSummary> {
  const apiKey = process.env.CRUX_API_KEY;
  const scope: "page" | "origin" = target.url ? "page" : "origin";
  if (!apiKey) {
    return { scope, hasData: false };
  }

  try {
    const body = target.url
      ? { url: target.url, formFactor }
      : { origin: target.origin, formFactor };
    const json = await callCrux(CRUX_ENDPOINT, body, apiKey);

    if (json.error || !json.record) {
      // 404 = "no data for this URL/origin at this percentile/form factor", not an error.
      return { scope, hasData: false };
    }

    const metrics: CruxSummary["metrics"] = {};
    for (const key of METRIC_KEYS) {
      const m = json.record.metrics[key];
      if (m?.percentiles?.p75 != null) {
        metrics[key] = { p75: m.percentiles.p75, category: rateCruxMetric(key, m.percentiles.p75) };
      }
    }

    return {
      scope,
      hasData: Object.keys(metrics).length > 0,
      metrics,
      collectionPeriod: json.record.collectionPeriod
        ? {
            firstDate: formatDate(json.record.collectionPeriod.firstDate),
            lastDate: formatDate(json.record.collectionPeriod.lastDate),
          }
        : undefined,
    };
  } catch {
    return { scope, hasData: false };
  }
}

export type CruxHistoryPoint = {
  date: string;
  metrics: Partial<Record<(typeof METRIC_KEYS)[number], number>>;
};

/** CrUX History API: last ~40 weeks of p75 trend data, used for the trend charts. */
export async function fetchCruxHistory(target: { url?: string; origin?: string }): Promise<CruxHistoryPoint[]> {
  const apiKey = process.env.CRUX_API_KEY;
  if (!apiKey) return [];

  try {
    const body = target.url ? { url: target.url } : { origin: target.origin };
    const res = await fetch(`${CRUX_HISTORY_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      record?: {
        metrics: Partial<
          Record<(typeof METRIC_KEYS)[number], { percentilesTimeseries?: { p75s: number[] }; timeseries?: { endDates: Array<{ year: number; month: number; day: number }> } } & { percentilesTimeseries?: { p75s: number[] } }>
        >;
        collectionPeriods?: Array<{ lastDate: { year: number; month: number; day: number } }>;
      };
      error?: unknown;
    };
    if (json.error || !json.record?.collectionPeriods) return [];

    const dates = json.record.collectionPeriods.map((p) => formatDate(p.lastDate));
    return dates.map((date, idx) => {
      const metrics: CruxHistoryPoint["metrics"] = {};
      for (const key of METRIC_KEYS) {
        const series = json.record?.metrics[key]?.percentilesTimeseries?.p75s;
        if (series && series[idx] != null) metrics[key] = series[idx];
      }
      return { date, metrics };
    });
  } catch {
    return [];
  }
}
