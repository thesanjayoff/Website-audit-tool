import { getAuditDetail, getPreviousDoneAudit } from "../repo/audits";
import { getBranding } from "../repo/settings";
import { buildExecutiveSummary, buildNextSteps } from "./summary";
import { maybeRewriteExecutiveSummary } from "../ai/rewrite";
import { topFixes, quickWins, groupByCategory } from "../scoring/prioritize";
import { computeScoreDeltas, computeFindingsDiff } from "./diff";
import { CATEGORY_WEIGHTS, PERFORMANCE_SUBWEIGHTS, ACCESSIBILITY_SUBWEIGHTS } from "../config/scoring";
import { CORE_WEB_VITALS_THRESHOLDS } from "../config/thresholds";
import { ACCESSIBILITY_METHODOLOGY_NOTE, MANUAL_ACCESSIBILITY_CHECKLIST } from "../engines/accessibility";
import { AI_METHODOLOGY_NOTE } from "../ai/rewrite";
import { db } from "../db/client";
import { findings as findingsTable } from "../db/schema";
import { eq } from "drizzle-orm";

export async function buildReportData(auditId: string) {
  const detail = await getAuditDetail(auditId);
  if (!detail) return null;
  const { audit, site, pages, findings } = detail;
  if (!site) return null;

  const previousAudit = await getPreviousDoneAudit(site.id, auditId);
  const previousFindings = previousAudit
    ? await db.select().from(findingsTable).where(eq(findingsTable.auditId, previousAudit.id))
    : null;

  const branding = await getBranding();
  const templateSummary = buildExecutiveSummary({ siteLabel: site.label, audit, findings });
  const executiveSummary = await maybeRewriteExecutiveSummary(templateSummary);
  const nextSteps = buildNextSteps(findings);

  const openFindings = findings.filter((f) => f.status === "open");

  return {
    site,
    audit,
    pages,
    findings,
    previousAudit,
    scoreDeltas: computeScoreDeltas(audit, previousAudit),
    findingsDiff: computeFindingsDiff(findings, previousFindings),
    branding,
    executiveSummary,
    nextSteps,
    topFixes: topFixes(openFindings, 5),
    quickWins: quickWins(openFindings, 8),
    groupedFindings: groupByCategory(findings),
    methodology: {
      lighthouseVersion: audit.lighthouseVersion,
      axeCoreVersion: audit.axeCoreVersion,
      pa11yVersion: audit.pa11yVersion,
      cwvThresholds: CORE_WEB_VITALS_THRESHOLDS,
      categoryWeights: CATEGORY_WEIGHTS,
      performanceSubweights: PERFORMANCE_SUBWEIGHTS,
      accessibilitySubweights: ACCESSIBILITY_SUBWEIGHTS,
      accessibilityNote: ACCESSIBILITY_METHODOLOGY_NOTE,
      manualAccessibilityChecklist: MANUAL_ACCESSIBILITY_CHECKLIST,
      aiNote: AI_METHODOLOGY_NOTE,
    },
  };
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof buildReportData>>>;
