import { getChartExport } from "@chore-tracker/database";
import { renderChartHtml } from "../../lib/chart-renderer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FamilyPrint({ searchParams }: { searchParams: Promise<{ charts?: string }> }) {
  const { charts } = await searchParams;
  const ids = charts?.split(",") ?? [];
  if (!ids.length || ids.length > 100 || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id))) notFound();
  let documents: string[];
  try {
    documents = await Promise.all(ids.map(async (id) => {
      const chart = getChartExport(id);
      return renderChartHtml(chart.snapshot, chart.checksum, false);
    }));
  } catch { notFound(); }
  const style = documents[0].match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const content = documents.map((document) => document.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "").join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Family chore charts</title><style>${style}</style></head><body><div class="download-bar"><a href="/">← Family board</a><button onclick="window.print()">Print family charts / Save as PDF</button></div>${content}</body></html>`;
  return <iframe title="Printable family charts" srcDoc={html} style={{ position: "fixed", inset: 0, border: 0, width: "100%", height: "100%" }} />;
}
