import assert from "node:assert/strict";
import { chromium } from "playwright";
import { addDays, weeklySpeciesLesson, weekDates, chartCheckboxBox, insetChartBox } from "../../packages/domain/src/index";
import { speciesPhoto } from "../../packages/database/src/species-photo";
import { renderChartHtml } from "../../apps/web/src/lib/chart-renderer";
import type { ChartSnapshot } from "../../packages/database/src/service";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.emulateMedia({ media: "print" });
  for (const theme of ["cats", "shark"]) for (let week = 0; week < 24; week++) {
    for (const count of week === 0 ? [0, 1, 2, 4, 5, 8, 9, 12, 13, 24, 25] : [2, 12]) {
      const date = addDays("2026-09-13", week * 7);
      const lesson = weeklySpeciesLesson(theme, date)!;
      const snapshot: ChartSnapshot = { chartId: "example", householdName: "Our family", memberId: theme,
        memberName: theme === "cats" ? "Kate" : "Henry", weekStartDate: date, themeKey: theme, planRevision: 1, layoutVersion: 4,
        speciesLesson: { ...lesson, photo: speciesPhoto(lesson.speciesId) }, rows: Array.from({ length: count }, (_, index) => ({
          key: String(index), title: index === 0 ? "Make bed" : index === 1 ? "Brush teeth" : `Chore ${index + 1}`,
          routineName: index < 1 ? "Morning" : "Evening", cells: weekDates(date).map((date, day) => ({ date, occurrenceId: `${index}-${day}`, completed: false })) })) };
      await page.setContent(await renderChartHtml(snapshot, "example"));
      await page.locator("img").evaluateAll(async images => { await Promise.all(images.map(image => (image as HTMLImageElement).decode())); });
      const pages = await page.locator(".print-sheet").evaluateAll(pages => pages.map(section => {
        const rect = section.getBoundingClientRect();
        const drawing = section.querySelector(".chart-page")!.getBoundingClientRect();
        if (drawing.left < rect.left + 23.9 || drawing.right > rect.right - 23.9 || drawing.bottom > rect.bottom - 23.9) throw new Error("Drawing exceeds printer-safe margins");
        const card = section.querySelector(".species-card")!.getBoundingClientRect();
        return { height: rect.height, tableBottom: section.querySelector("table")!.getBoundingClientRect().bottom, cardTop: card.top,
          cardBottom: card.bottom, contentBottom: Math.max(...Array.from(section.querySelectorAll(".species-card p, .species-card figcaption")).map(el => el.getBoundingClientRect().bottom)),
          boxes: Array.from(section.querySelectorAll(".box")).map(el => { const box = el.getBoundingClientRect(); return { x: (box.x - rect.x) / 96, y: (box.y - rect.y) / 96, width: box.width / 96, height: box.height / 96 }; }) };
      }));
      assert.equal(pages.length, Math.max(1, Math.ceil(count / 12)));
      for (const [index, sheet] of pages.entries()) {
        const context = `${theme} week ${week} rows ${count} page ${index}`;
        assert.equal(sheet.height, 1056, context);
        assert(sheet.tableBottom < sheet.cardTop, `${context}: table overlap`);
        assert(sheet.contentBottom < sheet.cardBottom, `${context}: text overflow`);
        sheet.boxes.forEach((box, cell) => {
          const expected = insetChartBox(chartCheckboxBox(Math.min(12, count - index * 12), Math.floor(cell / 7), cell % 7));
          for (const key of ["x", "y", "width", "height"] as const) assert(Math.abs(box[key] - expected[key]) < 0.002, `${context}: ${key} ${box[key]} != ${expected[key]}`);
        });
      }
      if (week === 0 && count === 25) {
        await page.pdf({ path: `/tmp/tidy-${theme}-multipage.pdf`, printBackground: true, preferCSSPageSize: true });
      }
      if (week === 0 && count === 2) {
        await page.pdf({ path: `/tmp/tidy-${theme}-adaptive.pdf`, printBackground: true, preferCSSPageSize: true });
        await page.screenshot({ path: `/tmp/tidy-${theme}-adaptive.png`, fullPage: true });
      }
    }
  }
  console.log("All 48 lessons fit short and crowded charts; pagination and every checkbox match the manifest geometry.");
} finally { await browser.close(); }
