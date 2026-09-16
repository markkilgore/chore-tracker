import { chartRowsPerPage, chartPageGeometry, PRINT_INSET, PRINT_SCALE } from "@chore-tracker/domain";
import type { ChartSnapshot } from "@chore-tracker/database";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

export const PRINT_CSS = `
  @page { size: Letter portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #25332f; background: #e9e7e0; font-family: "Trebuchet MS", Arial, sans-serif; }
  .chart-page { --accent: #d77a42; --soft: #f8e2c9; --row: #fff9f1; --ornament: "☀"; width: 8.5in; min-height: 11in; margin: 20px auto; padding: .5in; background: #fffdf8; position: relative; overflow: hidden; page-break-after: always; box-shadow: inset 0 .07in 0 var(--accent); }
  .print-sheet { width: 8.5in; height: 11in; padding: ${PRINT_INSET}in; margin: 20px auto; background: white; page-break-after: always; overflow: hidden; }
  .print-sheet:last-child { page-break-after: auto; }
  .print-sheet > .chart-page { zoom: ${PRINT_SCALE}; margin: 0; page-break-after: auto; }
  .chart-page:last-child { page-break-after: auto; }
  .chart-page:before { content: ""; position: absolute; width: 2.1in; height: 2.1in; border-radius: 50%; right: -.75in; top: -.85in; background: var(--soft); }
  .chart-page:after { content: var(--ornament); position: absolute; right: .55in; top: .28in; font: bold 36px Georgia, serif; color: var(--accent); transform: rotate(9deg); }
  .chart-page.has-art:before, .chart-page.has-art:after { display: none; }
  .theme-sunny { --accent: #d77a42; --soft: #f8e2c9; --row: #fff9f1; --ornament: "☀"; }
  .theme-space { --accent: #6257a4; --soft: #e5e1f3; --row: #f8f6fc; --ornament: "★"; }
  .theme-ocean { --accent: #288da1; --soft: #d7edf0; --row: #f3faf9; --ornament: "≈"; }
  .theme-italy { --accent: #238153; --soft: #e3f0e5; --row: #f7faf4; --ornament: "ITALIA"; }
  .theme-italy.chart-page:before { background: linear-gradient(90deg, #238153 0 33%, #fffdf8 33% 66%, #c84b4b 66%); opacity: .88; }
  .theme-cats { --accent: #ba6042; --soft: #f7dfd2; --row: #fff8f2; --ornament: "=^·^="; }
  .theme-shark { --accent: #397993; --soft: #dcebf0; --row: #f3f9fa; --ornament: "▲"; }
  .theme-shark-dino { --accent: #287f91; --soft: #dceee9; --row: #f2f9f5; --ornament: "≈ ▲"; }
  .chart-header { height: 1.35in; min-height: 1.35in; padding: .12in; position: relative; z-index: 1; overflow: hidden; border: 1px solid var(--soft); border-bottom: 0; border-radius: 14px 14px 0 0; background: #fffaf4; }
  .theme-shark-dino .chart-header { background: #eff8f4; }
  .header-copy { width: 4.05in; position: relative; z-index: 2; }
  .theme-art { position: absolute; z-index: 1; top: 0; right: 1.04in; width: 2.45in; height: 1.35in; object-fit: contain; object-position: right center; mix-blend-mode: multiply; }
  .kicker { color: var(--accent); letter-spacing: .16em; font-size: 9px; font-weight: 900; text-transform: uppercase; margin: 0 0 6px; }
  h1 { font: bold 31px Georgia, serif; margin: 0; letter-spacing: -.5px; line-height: 1.02; }
  .week-label { display: inline-block; color: #52615b; margin: 7px 0 0; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.86); border: 1px solid var(--soft); font-size: 11px; font-weight: 700; }
  .chart-meta { position: absolute; z-index: 3; top: .11in; right: .09in; width: .9in; min-height: 1.08in; padding: .06in; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; border: 1px solid var(--soft); border-radius: 10px; background: rgba(255,255,255,.96); }
  .chart-meta img { width: .53in; height: .53in; }
  .chart-meta div { font-size: 6px; color: #68746f; line-height: 1.25; }
  .chart-meta strong { display: block; color: #25332f; font-size: 7px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1.5px solid #bfc5c0; border-radius: 0 0 12px 12px; overflow: hidden; }
  th, td { border-right: 1px solid #d8d9d3; border-bottom: 1px solid #d8d9d3; }
  th:last-child, td:last-child { border-right: 0; }
  tbody tr:last-child td { border-bottom: 0; }
  thead th { height: .48in; background: var(--soft); color: #34463f; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  thead th:first-child { text-align: left; padding-left: 12px; width: 2.52in; }
  tbody td { height: .42in; text-align: center; }
  tbody tr:nth-child(even) td { background: var(--row); }
  .chore-name { text-align: left; padding: 0 10px; border-left: 4px solid color-mix(in srgb, var(--accent) 65%, white); }
  .chore-name strong { display: block; font-size: 11px; line-height: 1.15; }
  .chore-name small { display: inline-block; margin-top: 2px; padding: 1px 5px; border-radius: 999px; background: var(--soft); color: #596660; font-size: 6.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .box { width: .22in; height: .22in; border: 2px solid #596963; border-radius: 4px; margin: auto; display: grid; place-items: center; background: white; color: var(--accent); box-shadow: inset 0 0 0 1px rgba(255,255,255,.9); font-weight: 900; font-size: 14px; line-height: 1; }
  .theme-cats .box { border-radius: 6px; }
  .empty { color: #c7cbc8; font-size: 12px; }
  .species-card { position: absolute; bottom: .65in; left: .5in; right: .5in; height: 2.25in; padding: .12in; border: 1px solid var(--accent); border-radius: 12px; background: var(--row); display: grid; grid-template-columns: 2.15in 1fr; gap: .16in; }
  .species-card figure { margin: 0; }
  .species-photo { display: block; width: 2.15in; height: 1.65in; object-fit: contain; background: white; border-radius: 7px; }
  .species-card figcaption { font-size: 7px; line-height: 1.3; margin-top: 4px; }
  .species-card a { color: inherit; text-decoration: underline; }
  .species-copy .kicker { margin-bottom: 4px; font-size: 9px; }
  .species-copy h2 { margin: 0; font: bold 23px Georgia, serif; }
  .species-copy .scientific-name { font-size: 9px; font-style: italic; margin: 2px 0 6px; color: #52615b; }
  .species-copy h3 { margin: 0 0 4px; font-size: 12px; color: var(--accent); }
  .species-copy p { font-size: 13px; line-height: 1.35; margin: 0 0 6px; }
  .species-copy .species-source { font-size: 8px; margin-bottom: 0; }
  .layout-v3 table { border: 0; outline: 1px solid #bfc5c0; }
  .layout-v3 th, .layout-v3 td { border: 0; box-shadow: inset -1px -1px #d8d9d3; }
  .layout-v3 tbody td { height: var(--row-height); padding-top: 0; padding-bottom: 0; position: relative; }
  .layout-v3 .box { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: var(--box-size); height: var(--box-size); font-size: 20px; }
  .layout-v3 .chore-name { border-left: 4px solid var(--accent); }
  .layout-v3 .chore-name strong { font-size: var(--chore-font); overflow-wrap: anywhere; }
  .layout-v3 .chore-name small { font-size: 9px; letter-spacing: .06em; }
  .layout-v3 .routine-start td { box-shadow: inset 0 2px var(--accent), inset -1px -1px #d8d9d3; }
  .layout-v3 .species-card { top: var(--lesson-top); bottom: auto; height: var(--lesson-height); padding: .18in; gap: .2in; grid-template-columns: 2.7in 1fr; align-items: center; }
  .layout-v3 .species-photo { width: 100%; height: calc(var(--lesson-height) - .85in); }
  .layout-v3 .species-card figcaption { font-size: 8px; }
  .layout-v3 .species-copy p { font-size: 14px; }
  .layout-v3 .species-copy .kicker { font-size: 10px; }
  .layout-v3 .species-copy .scientific-name { font-size: 10px; }
  .layout-v3 .species-copy .species-source { font-size: 9px; }
  .layout-v3.lesson-stacked .species-card { display: block; }
  .layout-v3.lesson-stacked .species-photo { height: calc(var(--lesson-height) - 2.7in); }
  .layout-v3.lesson-stacked .species-copy { margin-top: .15in; }
  .layout-v3.lesson-stacked .species-copy h2 { font-size: 28px; }
  .layout-v3.lesson-stacked .species-copy h3 { font-size: 15px; }
  .layout-v3.lesson-stacked .species-copy p { font-size: 16px; }
  .layout-v3.lesson-stacked .species-copy .kicker { font-size: 10px; }
  .layout-v3.lesson-stacked .species-copy .scientific-name { font-size: 11px; }
  .layout-v3.lesson-stacked .species-copy .species-source { font-size: 9px; }
  .page-footer { position: absolute; bottom: .3in; left: .5in; right: .5in; padding-top: 5px; border-top: 1px solid var(--soft); display: flex; justify-content: space-between; color: #76817c; font-size: 7px; letter-spacing: .06em; }
  .corner-marker { position: absolute; width: 7px; height: 7px; background: #252525; }
  .corner-marker.tl { left: .18in; top: .18in; } .corner-marker.tr { right: .18in; top: .18in; }
  .corner-marker.bl { left: .18in; bottom: .18in; } .corner-marker.br { right: .18in; bottom: .18in; }
  .download-bar { width: 8.5in; margin: 20px auto; display: flex; justify-content: flex-end; gap: 8px; }
  .download-bar a { color: white; background: #2e795f; border-radius: 9px; text-decoration: none; font-weight: bold; padding: 10px 15px; }
  @media print { body { background: white; } .chart-page, .print-sheet { margin: 0; } .download-bar { display: none; } }
`;

const THEME_ART_FILES: Record<string, string> = {
  cats: "cats.webp",
  "shark-dino": "shark-dino.webp"
};

const THEME_KICKERS: Record<string, string> = {
  cats: "PAWS, CHECKS & PROUD MOMENTS",
  "shark-dino": "THE PREHISTORIC OCEAN CREW"
};

async function themeArtworkDataUrl(themeKey: string): Promise<string | null> {
  const filename = THEME_ART_FILES[themeKey];
  if (!filename) return null;
  try {
    const artwork = await readFile(path.join(process.cwd(), "apps/web/public/chart-art", filename));
    return `data:image/webp;base64,${artwork.toString("base64")}`;
  } catch {
    try {
      const artwork = await readFile(path.join(process.cwd(), "public/chart-art", filename));
      return `data:image/webp;base64,${artwork.toString("base64")}`;
    } catch {
      return null;
    }
  }
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function prettyWeek(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export async function renderChartHtml(snapshot: ChartSnapshot, checksum: string, includeToolbar = false): Promise<string> {
  const qr = await QRCode.toDataURL(`chorechart:v1:${snapshot.chartId}:${checksum}`, { margin: 0, width: 128, errorCorrectionLevel: "M" });
  const themeArtwork = await themeArtworkDataUrl(snapshot.themeKey);
  const rowsPerPage = chartRowsPerPage(snapshot.layoutVersion);
  const lesson = snapshot.speciesLesson;
  const pages = Array.from({ length: Math.max(1, Math.ceil(snapshot.rows.length / rowsPerPage)) }, (_, index) =>
    snapshot.rows.slice(index * rowsPerPage, index * rowsPerPage + rowsPerPage)
  );
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const content = pages.map((rows, pageIndex) => {
    const modern = (snapshot.layoutVersion ?? 1) >= 3;
    const inset = snapshot.layoutVersion === 4;
    const geometry = chartPageGeometry(rows.length, Boolean(lesson));
    const style = modern ? ` style="--row-height:${geometry.rowHeight}in;--box-size:${geometry.boxSize}in;--chore-font:${rows.length <= 4 ? 16 : rows.length <= 8 ? 14 : 11}px;--lesson-top:${geometry.lessonTop}in;--lesson-height:${geometry.lessonHeight}in"` : "";
    return `${inset ? '<div class="print-sheet">' : ""}<section class="chart-page theme-${escape(snapshot.themeKey)}${themeArtwork ? " has-art" : ""}${modern ? ` layout-v3${geometry.stacked ? " lesson-stacked" : ""}` : ""}"${style}>
    <i class="corner-marker tl"></i><i class="corner-marker tr"></i><i class="corner-marker bl"></i><i class="corner-marker br"></i>
    <header class="chart-header">
      ${themeArtwork ? `<img class="theme-art" src="${themeArtwork}" alt="" />` : ""}
      <div class="header-copy"><p class="kicker">${escape(THEME_KICKERS[snapshot.themeKey] ?? "MY TIDY WEEK")}</p><h1>${escape(snapshot.memberName)}’s Chore Chart</h1><p class="week-label">Week of ${prettyWeek(snapshot.weekStartDate)}</p></div>
      <div class="chart-meta"><img src="${qr}" alt="Chart QR code" /><div><strong>Chart ${escape(snapshot.chartId.slice(0, 8))}</strong>Keep this code visible<br/>when photographing</div></div>
    </header>
    <table><thead><tr><th>Chore</th>${dayLabels.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>
      ${rows.length ? rows.map((row, index) => `<tr${modern && (index === 0 || row.routineName !== rows[index - 1].routineName) ? ' class="routine-start"' : ""}><td class="chore-name"><strong>${escape(row.title)}</strong><small>${escape(row.routineName ?? "Any time")}</small></td>${row.cells.map((cell) => cell.occurrenceId ? `<td data-occurrence-id="${escape(cell.occurrenceId)}"><span class="box">${cell.completed ? "✓" : ""}</span></td>` : `<td class="empty">—</td>`).join("")}</tr>`).join("") : `<tr><td class="chore-name"><strong>No chores scheduled</strong><small>Enjoy the week!</small></td>${dayLabels.map(() => `<td class="empty">—</td>`).join("")}</tr>`}
    </tbody></table>
    ${lesson ? `<aside class="species-card" aria-label="Species of the week">
      <figure><img class="species-photo" src="${escape(lesson.photo.dataUrl)}" alt="${escape(lesson.name)} (${escape(lesson.scientificName)})" /><figcaption>Photo: <a href="${escape(lesson.photo.pageUrl)}">${escape(lesson.photo.credit)}</a> · <a href="${escape(lesson.photo.licenseUrl)}">${escape(lesson.photo.license)}</a><br/>Wikimedia Commons · uncropped thumbnail</figcaption></figure>
      <div class="species-copy"><p class="kicker">${lesson.theme === "cats" ? "WILD CAT" : "SHARK"} OF THE WEEK</p><h2>${escape(lesson.name)}</h2><p class="scientific-name">${escape(lesson.scientificName)}</p><h3>${escape(lesson.title)}</h3><p>${escape(lesson.fact)}</p><p><strong>Wonder together:</strong> ${escape(lesson.question)}</p><p class="species-source">Learn more: <a href="${escape(lesson.sourceUrl)}">${escape(lesson.sourceName)}</a></p></div>
    </aside>` : ""}
    <footer class="page-footer"><span>TIDY WEEK · ${escape(snapshot.householdName)}</span><span>Layout v${snapshot.layoutVersion ?? 1} · ${pageIndex + 1}/${pages.length} · ${escape(checksum)}</span></footer>
  </section>${inset ? "</div>" : ""}`; }).join("");
  const toolbar = includeToolbar ? `<div class="download-bar"><a href="/">← Family board</a><a href="/api/v1/chart-exports/${snapshot.chartId}/pdf">Download PDF</a></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escape(snapshot.memberName)}’s Chore Chart</title><style>${PRINT_CSS}</style></head><body>${toolbar}${content}</body></html>`;
}
