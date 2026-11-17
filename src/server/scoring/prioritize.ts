import { priorityScore } from "../config/scoring";
import type { findings as findingsTable } from "../db/schema";

type Finding = typeof findingsTable.$inferSelect;

const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function sortByPriority(items: Finding[]): Finding[] {
  return [...items].sort((a, b) => {
    const scoreDiff = priorityScore(b.impact, b.effort) - priorityScore(a.impact, a.effort);
    if (scoreDiff !== 0) return scoreDiff;
    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.affectedPageIds.length - a.affectedPageIds.length;
  });
}

export function topFixes(items: Finding[], count = 5): Finding[] {
  return sortByPriority(items.filter((f) => f.status === "open")).slice(0, count);
}

export function quickWins(items: Finding[], count = 8): Finding[] {
  return items
    .filter((f) => f.status === "open" && f.effort === "low" && (f.impact === "medium" || f.impact === "high"))
    .sort((a, b) => priorityScore(b.impact, b.effort) - priorityScore(a.impact, a.effort))
    .slice(0, count);
}

export function groupByCategory(items: Finding[]): Record<Finding["category"], Finding[]> {
  const result: Record<Finding["category"], Finding[]> = {
    performance: [],
    seo: [],
    accessibility: [],
    security: [],
    content: [],
  };
  for (const item of items) result[item.category].push(item);
  return result;
}
