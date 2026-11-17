/**
 * Optional AI layer: rewrites the plain-English executive summary (and can
 * simplify individual finding explanations) into friendlier client-facing
 * language. Disabled by default (AI_PROVIDER unset or "local").
 *
 * Hard rule: the AI only ever sees already-computed audit data (scores,
 * finding titles/severities/business impact) — never raw page HTML, headers,
 * cookies, or any other page content. Scores and raw findings always come
 * from the engines; the AI can only rephrase text, never invent findings.
 * Output is always labelled as AI-written and remains editable/overridable.
 */

export type AiRewriteResult = { text: string; aiGenerated: boolean };

const ANTHROPIC_MODEL = "claude-haiku-5-5";

function isAiEnabled(): boolean {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  return provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY;
}

async function callAnthropic(prompt: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text;
    return text?.trim() || null;
  } catch {
    return null;
  }
}

export async function maybeRewriteExecutiveSummary(templateText: string): Promise<AiRewriteResult> {
  if (!isAiEnabled()) return { text: templateText, aiGenerated: false };

  const prompt = [
    "You are editing a website audit executive summary for a non-technical business owner.",
    "Rewrite the following summary to be warmer and clearer, in 3-5 sentences, plain English, no jargon.",
    "Do not invent any new facts, numbers, or findings — only rephrase what's given.",
    "",
    "Summary to rewrite:",
    templateText,
  ].join("\n");

  const rewritten = await callAnthropic(prompt);
  return rewritten ? { text: rewritten, aiGenerated: true } : { text: templateText, aiGenerated: false };
}

export async function maybeSimplifyFinding(title: string, explanation: string): Promise<AiRewriteResult> {
  if (!isAiEnabled()) return { text: explanation, aiGenerated: false };

  const prompt = [
    `Rewrite this one technical audit finding explanation for a non-technical reader, in 1-2 short sentences.`,
    `Do not invent facts or change the meaning. Title: "${title}"`,
    `Explanation: "${explanation}"`,
  ].join("\n");

  const rewritten = await callAnthropic(prompt);
  return rewritten ? { text: rewritten, aiGenerated: true } : { text: explanation, aiGenerated: false };
}

export const AI_METHODOLOGY_NOTE =
  "When enabled, the optional AI layer only rewrites the wording of the executive summary and finding explanations for a non-technical audience. " +
  "It is given only computed scores and finding titles/severities/business impact — never raw page content, headers, or cookies — and cannot change any score or add/remove findings. " +
  "AI-written text is labelled below and can always be edited.";
