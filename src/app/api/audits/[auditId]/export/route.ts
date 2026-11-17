import { NextResponse } from "next/server";
import { buildReportData } from "@/server/reports/buildReportData";
import { renderStandaloneHtmlReport } from "@/server/reports/htmlReport";
import { renderReportPdf } from "@/server/reports/pdf";
import { findingsToCsv, findingsToMarkdown } from "@/server/reports/exportFindings";

export async function GET(req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "html";

  const data = await buildReportData(auditId);
  if (!data) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  const filenameSafe = data.site.label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

  switch (format) {
    case "html": {
      const html = renderStandaloneHtmlReport(data);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameSafe}-audit-report.html"`,
        },
      });
    }
    case "pdf": {
      const html = renderStandaloneHtmlReport(data);
      const pdf = await renderReportPdf(html);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filenameSafe}-audit-report.pdf"`,
        },
      });
    }
    case "json": {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filenameSafe}-audit-data.json"`,
        },
      });
    }
    case "csv": {
      const csv = findingsToCsv(data.findings);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameSafe}-findings.csv"`,
        },
      });
    }
    case "markdown": {
      const md = findingsToMarkdown(data.findings.filter((f) => f.status === "open"), data.site.label);
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameSafe}-todo.md"`,
        },
      });
    }
    default:
      return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }
}
