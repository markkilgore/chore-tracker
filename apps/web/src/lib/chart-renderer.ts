import type { ChartSnapshot } from "@chore-tracker/database";
import QRCode from "qrcode";

export const PRINT_CSS = `
  @page { size: Letter portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #25332f; background: #e9e7e0; font-family: Arial, sans-serif; }
  .chart-page { width: 8.5in; min-height: 11in; margin: 20px auto; padding: .5in; background: #fffdf8; position: relative; overflow: hidden; page-break-after: always; }
  .chart-page:last-child { page-break-after: auto; }
  .chart-page:before { content: ""; position: absolute; width: 2.1in; height: 2.1in; border-radius: 50%; right: -.75in; top: -.85in; background: var(--soft); }
  .chart-page:after { content: var(--ornament); position: absolute; right: .55in; top: .28in; font: bold 36px Georgia, serif; color: var(--accent); transform: rotate(9deg); }
  .theme-sunny { --accent: #d77a42; --soft: #f8e2c9; --ornament: "☀"; }
  .theme-space { --accent: #6257a4; --soft: #e5e1f3; --ornament: "★"; }
  .theme-ocean { --accent: #288da1; --soft: #d7edf0; --ornament: "≈"; }
  .chart-header { display: flex; justify-content: space-between; align-items: flex-start; min-height: 1.35in; position: relative; z-index: 1; }
  .kicker { color: var(--accent); letter-spacing: .16em; font-size: 9px; font-weight: 900; text-transform: uppercase; margin: 0 0 6px; }
  h1 { font: bold 34px Georgia, serif; margin: 0; letter-spacing: -.5px; }
  .week-label { color: #68746f; margin: 7px 0 0; font-size: 13px; }
  .chart-meta { display: flex; align-items: center; gap: 9px; padding-right: .47in; }
  .chart-meta img { width: .62in; height: .62in; }
  .chart-meta div { font-size: 8px; color: #68746f; line-height: 1.45; }
  .chart-meta strong { display: block; color: #25332f; font-size: 10px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1.5px solid #c9cbc5; border-radius: 9px; overflow: hidden; }
  th, td { border-right: 1px solid #d8d9d3; border-bottom: 1px solid #d8d9d3; }
  th:last-child, td:last-child { border-right: 0; }
  tbody tr:last-child td { border-bottom: 0; }
  thead th { height: .48in; background: var(--soft); color: #3f4c47; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  thead th:first-child { text-align: left; padding-left: 12px; width: 2.52in; }
  tbody td { height: .42in; text-align: center; }
  .chore-name { text-align: left; padding: 0 11px; }
  .chore-name strong { display: block; font-size: 11px; }
  .chore-name small { color: #7d8782; font-size: 7px; text-transform: uppercase; letter-spacing: .08em; }
  .box { width: .22in; height: .22in; border: 1.7px solid #6f7b76; border-radius: 3px; margin: auto; display: grid; place-items: center; color: var(--accent); font-weight: 900; font-size: 14px; line-height: 1; }
  .empty { color: #c7cbc8; font-size: 12px; }
  .page-footer { position: absolute; bottom: .3in; left: .5in; right: .5in; display: flex; justify-content: space-between; color: #88908d; font-size: 7px; letter-spacing: .06em; }
  .corner-marker { position: absolute; width: 7px; height: 7px; background: #252525; }
  .corner-marker.tl { left: .18in; top: .18in; } .corner-marker.tr { right: .18in; top: .18in; }
  .corner-marker.bl { left: .18in; bottom: .18in; } .corner-marker.br { right: .18in; bottom: .18in; }
  .download-bar { width: 8.5in; margin: 20px auto; display: flex; justify-content: flex-end; gap: 8px; }
  .download-bar a { color: white; background: #2e795f; border-radius: 9px; text-decoration: none; font-weight: bold; padding: 10px 15px; }
  @media print { body { background: white; } .chart-page { margin: 0; } .download-bar { display: none; } }
`;

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function prettyWeek(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export async function renderChartHtml(snapshot: ChartSnapshot, checksum: string, includeToolbar = false): Promise<string> {
  const qr = await QRCode.toDataURL(`chorechart:v1:${snapshot.chartId}:${checksum}`, { margin: 0, width: 128, errorCorrectionLevel: "M" });
  const pages = Array.from({ length: Math.max(1, Math.ceil(snapshot.rows.length / 18)) }, (_, index) =>
    snapshot.rows.slice(index * 18, index * 18 + 18)
  );
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const content = pages.map((rows, pageIndex) => `<section class="chart-page theme-${escape(snapshot.themeKey)}">
    <i class="corner-marker tl"></i><i class="corner-marker tr"></i><i class="corner-marker bl"></i><i class="corner-marker br"></i>
    <header class="chart-header">
      <div><p class="kicker">MY TIDY WEEK</p><h1>${escape(snapshot.memberName)}’s Chore Chart</h1><p class="week-label">Week of ${prettyWeek(snapshot.weekStartDate)}</p></div>
      <div class="chart-meta"><img src="${qr}" alt="Chart QR code" /><div><strong>Chart ${escape(snapshot.chartId.slice(0, 8))}</strong>Keep this code visible<br/>when photographing</div></div>
    </header>
    <table><thead><tr><th>Chore</th>${dayLabels.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr><td class="chore-name"><strong>${escape(row.title)}</strong><small>${escape(row.routineName ?? "Any time")}</small></td>${row.cells.map((cell) => cell.occurrenceId ? `<td data-occurrence-id="${escape(cell.occurrenceId)}"><span class="box">${cell.completed ? "✓" : ""}</span></td>` : `<td class="empty">—</td>`).join("")}</tr>`).join("") : `<tr><td class="chore-name"><strong>No chores scheduled</strong><small>Enjoy the week!</small></td>${dayLabels.map(() => `<td class="empty">—</td>`).join("")}</tr>`}
    </tbody></table>
    <footer class="page-footer"><span>TIDY WEEK · ${escape(snapshot.householdName)}</span><span>Layout v1 · ${pageIndex + 1}/${pages.length} · ${escape(checksum)}</span></footer>
  </section>`).join("");
  const toolbar = includeToolbar ? `<div class="download-bar"><a href="/">← Family board</a><a href="/api/v1/chart-exports/${snapshot.chartId}/pdf">Download PDF</a></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escape(snapshot.memberName)}’s Chore Chart</title><style>${PRINT_CSS}</style></head><body>${toolbar}${content}</body></html>`;
}
