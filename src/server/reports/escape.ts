/**
 * All audited page content (titles, snippets, headers, URLs) is untrusted —
 * it comes from third-party websites, not from us. Every dynamic value that
 * ends up in a generated report MUST go through this before being placed in
 * HTML, including inside attributes, to prevent stored XSS in the report
 * itself (and, transitively, in the PDF rendered from that HTML).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
