import type { FindingEvidence } from "../db/schema";

/**
 * Raw finding emitted by a single engine for a single page. The aggregator
 * (see ../scoring/aggregate.ts) groups these across pages/devices into the
 * `findings` rows that actually get stored, deduplicating identical issues
 * that show up on many pages into one "affects N pages" entry.
 */
export type FindingDraft = {
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
  wcagCriteria: string[];
  /** Explicit dedup key override; defaults to `${engine}:${title}` when omitted. */
  groupKeyOverride?: string;
};
