import { getChartExport } from "@chore-tracker/database";
import { renderChartHtml } from "../../../lib/chart-renderer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PrintPreview(context: { params: Promise<{ chartId: string }> }) {
  const { chartId } = await context.params;
  try {
    const chart = getChartExport(chartId);
    const html = await renderChartHtml(chart.snapshot, chart.checksum, true);
    return <iframe title="Printable chore chart" srcDoc={html} style={{ position: "fixed", inset: 0, border: 0, width: "100%", height: "100%" }} />;
  } catch {
    notFound();
  }
}
