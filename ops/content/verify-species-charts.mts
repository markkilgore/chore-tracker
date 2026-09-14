// No server or real household data needed. Outputs representative charts to /tmp.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { addDays, weeklySpeciesLesson, weekDates } from "../../packages/domain/src/index";
import { speciesPhoto } from "../../packages/database/src/species-photo";
import { renderChartHtml } from "../../apps/web/src/lib/chart-renderer";
import type { ChartSnapshot } from "../../packages/database/src/service";

const browser = await chromium.launch({ headless: true, ...(process.env.PDF_CHROMIUM_PATH ? { executablePath: process.env.PDF_CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.emulateMedia({ media: "print" });
  await page.route("https://**/*", (route) => route.abort());
  for (const theme of ["shark-dino", "cats"]) {
    for (let week = 0; week < 24; week++) {
      const date = addDays("2026-09-13", week * 7);
      const lesson = weeklySpeciesLesson(theme, date)!;
      const snapshot: ChartSnapshot = { chartId: "example-chart", householdName: "Our family", memberId: theme,
        memberName: theme === "cats" ? "Kate" : "Henry", weekStartDate: date, themeKey: theme, planRevision: 1, layoutVersion: 2,
        speciesLesson: { ...lesson, photo: speciesPhoto(lesson.speciesId) },
        rows: Array.from({ length: 13 }, (_, index) => ({ key: String(index), title: `Chore ${index + 1}`, routineName: "Morning",
          cells: weekDates(date).map((date, day) => ({ date, occurrenceId: `${index}-${day}`, completed: false })) })) };
      const html = await renderChartHtml(snapshot, "example-checksum");
      await page.setContent(html);
      await page.locator("img").evaluateAll(async (images) => { await Promise.all(images.map((image) => (image as HTMLImageElement).decode())); });
      const geometry = await page.locator(".chart-page").evaluateAll((pages) => pages.map((section) => {
        const card = section.querySelector(".species-card")!;
        const copy = section.querySelector(".species-copy")!;
        const credit = section.querySelector("figcaption")!;
        const table = section.querySelector("table")!;
        return { pageHeight: section.getBoundingClientRect().height, tableBottom: table.getBoundingClientRect().bottom,
          cardTop: card.getBoundingClientRect().top, cardBottom: card.getBoundingClientRect().bottom,
          copyBottom: copy.getBoundingClientRect().bottom, creditBottom: credit.getBoundingClientRect().bottom,
          rows: table.querySelectorAll("tbody tr").length };
      }));
      assert.deepEqual(geometry.map((item) => item.rows), [12, 1]);
      for (const item of geometry) {
        assert.equal(item.pageHeight, 1056, `${lesson.id}: Letter height`);
        assert(item.tableBottom < item.cardTop, `${lesson.id}: chore overlap`);
        assert(item.copyBottom <= item.cardBottom && item.creditBottom <= item.cardBottom, `${lesson.id}: clipped lesson`);
      }
      if (week === 0) {
        await fs.writeFile(`/tmp/tidy-${theme}-species.html`, html);
        await page.pdf({ path: `/tmp/tidy-${theme}-species.pdf`, format: "Letter", printBackground: true, preferCSSPageSize: true });
        await page.locator(".chart-page").first().screenshot({ path: `/tmp/tidy-${theme}-species.png` });
        // Check that adding the lesson keeps the first checkbox at the same position.
        const current = await page.locator(".box").first().boundingBox();
        delete snapshot.speciesLesson;
        delete snapshot.layoutVersion;
        await page.setContent(await renderChartHtml(snapshot, "legacy-checksum"));
        assert.deepEqual(await page.locator(".box").first().boundingBox(), current);
      }
    }
  }
  console.log("Verified all 48 lessons offline: photos decode, text fits, 12/13-row pagination, and checkbox positions match legacy charts. Sample PDFs and PNGs: /tmp/tidy-{cats,shark-dino}-species.*");
} finally { await browser.close(); }
