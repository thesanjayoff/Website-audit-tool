import { getSharedBrowser } from "../browser/chromium";

/**
 * Renders an already-escaped, self-contained HTML report string to a PDF
 * buffer. The HTML never includes live external resources (no fetches, no
 * remote scripts), so there's no SSRF/XSS surface at render time — the
 * escaping happens upstream in htmlReport.ts.
 */
export async function renderReportPdf(html: string): Promise<Buffer> {
  const browser = await getSharedBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return pdf;
  } finally {
    await context.close();
  }
}
