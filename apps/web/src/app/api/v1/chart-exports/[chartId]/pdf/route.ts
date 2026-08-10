import { getChartExport } from "@chore-tracker/database";
import { chromium } from "playwright";
import { renderChartHtml } from "../../../../../../lib/chart-renderer";
import { apiError } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ chartId: string }> }) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const { chartId } = await context.params;
    const chart = getChartExport(chartId);
    const html = await renderChartHtml(chart.snapshot, chart.checksum);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PDF_CHROMIUM_PATH || undefined,
      args: process.env.PDF_CHROMIUM_PATH ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined
    });
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    const filename = `${chart.snapshot.memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${chart.snapshot.weekStartDate}.pdf`;
    return new Response(new Blob([new Uint8Array(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Chart-Id": chartId,
        "X-Chart-Checksum": chart.checksum
      }
    });
  } catch (error) {
    return apiError(error);
  } finally {
    await browser?.close();
  }
}
