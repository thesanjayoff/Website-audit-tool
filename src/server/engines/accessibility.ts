import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import pa11y from "pa11y";
import { chromiumExecutablePath } from "../browser/chromium";
import type { FindingDraft } from "./types";

export const AXE_CORE_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("axe-core/package.json").version as string;
  } catch {
    return "unknown";
  }
})();

export const PA11Y_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("pa11y/package.json").version as string;
  } catch {
    return "unknown";
  }
})();

let axeSource: string | null = null;
async function getAxeSource(): Promise<string> {
  if (!axeSource) {
    axeSource = await readFile(
      path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
      "utf-8",
    );
  }
  return axeSource;
}

type AxeNode = {
  html: string;
  target: string[];
  failureSummary?: string;
};
type AxeResultItem = {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
};
type AxeRunResult = {
  violations: AxeResultItem[];
};

const IMPACT_TO_SEVERITY: Record<string, FindingDraft["severity"]> = {
  critical: "critical",
  serious: "high",
  moderate: "medium",
  minor: "low",
};

function wcagCriteriaFromTags(tags: string[]): string[] {
  return tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => {
      // e.g. "wcag143" -> "1.4.3"
      const digits = t.replace("wcag", "");
      return digits.split("").join(".").replace(/^(\d)\.(\d)\.?/, "$1.$2.").replace(/\.$/, "");
    });
}

export async function runAxe(page: Page, pageUrl: string): Promise<FindingDraft[]> {
  await page.addScriptTag({ content: await getAxeSource() });
  const result = (await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    });
  })) as AxeRunResult;

  return result.violations.map((v) => ({
    category: "accessibility" as const,
    engine: "axe-core",
    title: v.help,
    explanation: v.description,
    businessImpact: accessibilityBusinessImpact(v.impact),
    severity: IMPACT_TO_SEVERITY[v.impact ?? "moderate"] ?? "medium",
    effort: "medium",
    impact: v.impact === "critical" || v.impact === "serious" ? "high" : "medium",
    evidence: v.nodes.slice(0, 5).map((n) => ({
      pageUrl,
      selector: n.target.join(" "),
      snippet: n.html,
    })),
    fixSuggestion: `${v.help}. See ${v.helpUrl} for the exact WCAG rationale and fix patterns.`,
    wcagCriteria: wcagCriteriaFromTags(v.tags),
    groupKeyOverride: `axe-core:${v.id}`,
  }));
}

function accessibilityBusinessImpact(impact: string | null): string {
  switch (impact) {
    case "critical":
      return "This can block some visitors — e.g. screen reader or keyboard users — from completing core tasks like buying something or submitting a form, and is a common basis for accessibility complaints or legal risk.";
    case "serious":
      return "This creates a real barrier for some visitors using assistive technology, and may push them to leave the site or use a competitor instead.";
    default:
      return "This makes the experience harder for some visitors using assistive technology, even though it doesn't fully block them.";
  }
}

export async function runPa11y(url: string, pageUrl: string): Promise<FindingDraft[]> {
  try {
    // @types/pa11y's LaunchConfig predates Pa11y's current puppeteer.launch
    // passthrough, which does accept `args` alongside `executablePath`.
    const options = {
      standard: "WCAG2AA",
      runners: ["htmlcs"],
      timeout: 30_000,
      chromeLaunchConfig: {
        executablePath: chromiumExecutablePath(),
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    } as unknown as Parameters<typeof pa11y>[1];
    const result = await pa11y(url, options);

    return result.issues
      .filter((issue) => issue.type === "error" || issue.type === "warning")
      .map((issue) => ({
        category: "accessibility" as const,
        engine: "pa11y-htmlcs",
        title: issue.message,
        explanation: `HTML CodeSniffer rule ${issue.code} flagged on <${issue.selector || "unknown element"}>.`,
        businessImpact: issue.type === "error"
          ? "This is a clear WCAG 2.0/2.1 AA failure that can block assistive-technology users from part of the page."
          : "This is a likely accessibility issue worth a manual look, though automated tools can't always be certain.",
        severity: issue.type === "error" ? "high" : "low",
        effort: "medium",
        impact: issue.type === "error" ? "high" : "low",
        evidence: [{ pageUrl, selector: issue.selector, snippet: issue.context ?? undefined }],
        fixSuggestion: issue.message,
        wcagCriteria: [issue.code],
        groupKeyOverride: `pa11y-htmlcs:${issue.code}`,
      }));
  } catch (err) {
    // A Pa11y crash (e.g. page timeout) shouldn't abort the whole audit.
    return [
      {
        category: "accessibility",
        engine: "pa11y-htmlcs",
        title: "Pa11y could not complete its scan of this page",
        explanation: err instanceof Error ? err.message : "Unknown Pa11y error",
        businessImpact: "This page's accessibility results are incomplete from this engine; axe-core results above still apply.",
        severity: "info",
        effort: "low",
        impact: "low",
        evidence: [{ pageUrl }],
        fixSuggestion: "Re-run the audit; if it persists, the page may be slow to load or block automated browsers.",
        wcagCriteria: [],
      },
    ];
  }
}

/** Extra heuristic checks beyond axe/Pa11y: focus visibility, skip links, labels, link text, lang, heading order. */
export async function runManualHeuristicChecks(page: Page, pageUrl: string): Promise<FindingDraft[]> {
  const findings: FindingDraft[] = [];

  const data = await page.evaluate(() => {
    const htmlLang = document.documentElement.getAttribute("lang");

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    let headingOrderOk = true;
    let h1Count = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i] === 1) h1Count++;
      if (i > 0 && headings[i]! - headings[i - 1]! > 1) headingOrderOk = false;
    }

    const bodyText = (document.body.innerText || "").toLowerCase();
    const hasSkipLink = [...document.querySelectorAll('a[href^="#"]')].some((a) =>
      /skip to (main )?content|skip navigation/i.test(a.textContent || ""),
    );

    const inputs = [...document.querySelectorAll("input, select, textarea")].filter(
      (el) => (el as HTMLInputElement).type !== "hidden" && (el as HTMLInputElement).type !== "submit" && (el as HTMLInputElement).type !== "button",
    );
    const unlabeledInputs = inputs.filter((el) => {
      const id = el.getAttribute("id");
      const hasLabelFor = id ? !!document.querySelector(`label[for="${id}"]`) : false;
      const hasAriaLabel = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
      const wrappedInLabel = !!el.closest("label");
      return !hasLabelFor && !hasAriaLabel && !wrappedInLabel;
    });

    const genericLinkTexts = ["click here", "read more", "learn more", "here", "more", "link"];
    const vagueLinkEls = [...document.querySelectorAll("a")].filter((a) => {
      const text = (a.textContent || "").trim().toLowerCase();
      return genericLinkTexts.includes(text) && !a.getAttribute("aria-label");
    });

    let outlineSuppressed = false;
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            const cssText = (rule as CSSStyleRule).cssText || "";
            if (/:focus[^{]*\{[^}]*outline\s*:\s*(none|0)/i.test(cssText)) {
              outlineSuppressed = true;
              break;
            }
          }
        } catch {
          // cross-origin stylesheet, can't inspect
        }
        if (outlineSuppressed) break;
      }
    } catch {
      // ignore
    }

    return {
      htmlLang,
      h1Count,
      headingOrderOk,
      hasSkipLink,
      unlabeledCount: unlabeledInputs.length,
      unlabeledSamples: unlabeledInputs.slice(0, 3).map((el) => el.outerHTML.slice(0, 200)),
      vagueLinkCount: vagueLinkEls.length,
      vagueLinkSamples: vagueLinkEls.slice(0, 3).map((el) => el.outerHTML.slice(0, 200)),
      outlineSuppressed,
      bodyTextLength: bodyText.length,
    };
  });

  if (!data.htmlLang) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "Missing lang attribute on <html>",
      explanation: "The page doesn't declare its language via <html lang=\"...\">, so screen readers may use the wrong pronunciation/voice.",
      businessImpact: "Screen reader users may hear the page read in the wrong language, making it harder to understand.",
      severity: "medium",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl }],
      fixSuggestion: 'Add a lang attribute, e.g. <html lang="en">.',
      wcagCriteria: ["3.1.1"],
      groupKeyOverride: "manual-heuristics:missing-lang",
    });
  }

  if (data.h1Count === 0) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "Page is missing a top-level <h1>",
      explanation: "No <h1> heading was found, which removes an important landmark for screen reader users and search engines.",
      businessImpact: "Visitors and search engines have a harder time understanding what the page is about.",
      severity: "low",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl }],
      fixSuggestion: "Add a single, descriptive <h1> that matches the page's main topic.",
      wcagCriteria: ["1.3.1"],
      groupKeyOverride: "manual-heuristics:missing-h1",
    });
  } else if (data.h1Count > 1) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "Multiple <h1> headings on one page",
      explanation: `Found ${data.h1Count} <h1> elements. Multiple top-level headings can confuse the page's outline for screen reader users.`,
      businessImpact: "Makes the page structure harder to follow for assistive-technology users.",
      severity: "info",
      effort: "low",
      impact: "low",
      evidence: [{ pageUrl }],
      fixSuggestion: "Use a single <h1> per page and demote the others to <h2>+ based on the real content hierarchy.",
      wcagCriteria: ["1.3.1"],
      groupKeyOverride: "manual-heuristics:multiple-h1",
    });
  }

  if (!data.headingOrderOk) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "Heading levels skip a level",
      explanation: "The page jumps from one heading level to a much deeper one (e.g. h2 straight to h4), breaking the logical outline.",
      businessImpact: "Screen reader users navigating by heading level may miss content or get confused about the page structure.",
      severity: "low",
      effort: "low",
      impact: "low",
      evidence: [{ pageUrl }],
      fixSuggestion: "Restructure headings so levels descend one at a time (h1 -> h2 -> h3, no skipped levels).",
      wcagCriteria: ["1.3.1"],
      groupKeyOverride: "manual-heuristics:heading-order",
    });
  }

  if (!data.hasSkipLink) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "No \"skip to content\" link found",
      explanation: "There's no visible or screen-reader-only link to skip repeated navigation and jump to the main content.",
      businessImpact: "Keyboard and screen reader users must tab through the full navigation on every page before reaching the content.",
      severity: "low",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl }],
      fixSuggestion: 'Add a "Skip to main content" link as the first focusable element, targeting the main content region.',
      wcagCriteria: ["2.4.1"],
      groupKeyOverride: "manual-heuristics:skip-link",
    });
  }

  if (data.unlabeledCount > 0) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: `${data.unlabeledCount} form field(s) without an associated label`,
      explanation: "These inputs have no <label>, aria-label, or aria-labelledby, so screen readers can't announce their purpose.",
      businessImpact: "Visitors using screen readers may not be able to tell what a field is for, which can block form submissions (and lost leads/sales).",
      severity: "high",
      effort: "low",
      impact: "high",
      evidence: data.unlabeledSamples.map((s) => ({ pageUrl, snippet: s })),
      fixSuggestion: 'Add a visible <label for="..."> or an aria-label to each field.',
      wcagCriteria: ["1.3.1", "4.1.2"],
      groupKeyOverride: "manual-heuristics:unlabeled-input",
    });
  }

  if (data.vagueLinkCount > 0) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: `${data.vagueLinkCount} link(s) use vague text like "click here" or "read more"`,
      explanation: "Link text that only makes sense in context (\"click here\", \"read more\") is confusing when read out of context, e.g. in a screen reader's list of links.",
      businessImpact: "Makes it harder for assistive-technology users to decide which links are worth following.",
      severity: "low",
      effort: "low",
      impact: "low",
      evidence: data.vagueLinkSamples.map((s) => ({ pageUrl, snippet: s })),
      fixSuggestion: 'Rewrite link text to describe the destination, e.g. "Read our pricing guide" instead of "read more".',
      wcagCriteria: ["2.4.4"],
      groupKeyOverride: "manual-heuristics:vague-link-text",
    });
  }

  if (data.outlineSuppressed) {
    findings.push({
      category: "accessibility",
      engine: "manual-heuristics",
      title: "Focus outline appears to be disabled in CSS",
      explanation: "A `:focus { outline: none }` (or `outline: 0`) rule was found, which usually removes the visible indicator of keyboard focus.",
      businessImpact: "Keyboard-only users can lose track of where they are on the page, making navigation difficult or impossible.",
      severity: "medium",
      effort: "low",
      impact: "medium",
      evidence: [{ pageUrl }],
      fixSuggestion: "Remove the rule, or replace it with a custom but clearly visible focus style (e.g. a high-contrast outline or box-shadow).",
      wcagCriteria: ["2.4.7"],
      groupKeyOverride: "manual-heuristics:focus-outline-suppressed",
    });
  }

  return findings;
}

export const ACCESSIBILITY_METHODOLOGY_NOTE =
  "Accessibility results combine axe-core and HTML CodeSniffer (via Pa11y) automated rule checks against WCAG 2.0/2.1/2.2 A and AA, plus a handful of extra heuristic checks (lang attribute, heading order, skip links, form labels, vague link text, focus-outline suppression). " +
  "Automated tools are estimated to catch roughly 30-50% of real WCAG failures. They cannot assess whether content actually makes sense to a screen reader user, whether custom widgets behave correctly with assistive tech, or many other judgment-based criteria. " +
  "This report is not a substitute for manual testing and must never be used to claim a site is \"WCAG compliant\" or \"ADA compliant\" — only that these specific automated checks passed or failed.";

export const MANUAL_ACCESSIBILITY_CHECKLIST = [
  "Navigate the entire page using only the keyboard (Tab, Shift+Tab, Enter, Space, arrow keys) — can you reach and operate everything?",
  "Run through the key user flows with a screen reader (NVDA/JAWS on Windows, VoiceOver on Mac/iOS, TalkBack on Android).",
  "Zoom the page to 200% and reflow at a narrow viewport — does content remain usable without horizontal scrolling or overlap?",
  "Check that any video has accurate captions and any audio-only content has a transcript.",
  "Verify color is never the only way information is conveyed (e.g. error states, required fields, chart legends).",
  "Test forms end-to-end for clear error messages that are announced to assistive technology.",
];
