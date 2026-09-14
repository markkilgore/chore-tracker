import { describe, expect, it } from "vitest";
import { renderChartHtml } from "./chart-renderer";
import type { ChartSnapshot } from "@chore-tracker/database";
import { weeklySpeciesLesson, type ISODate } from "@chore-tracker/domain";

describe("print chart renderer", () => {
  it("renders a deterministic Letter chart with occurrence-linked cells", async () => {
    const snapshot: ChartSnapshot = {
      chartId: "chart-id",
      householdName: "Test Family",
      memberId: "member-id",
      memberName: "Kate",
      weekStartDate: "2026-08-09",
      themeKey: "space",
      planRevision: 2,
      rows: [{
        key: "make-bed",
        title: "Make bed",
        routineName: "Morning",
        cells: [
          { date: "2026-08-09", occurrenceId: "occurrence-1", completed: false },
          ...Array.from({ length: 6 }, (_, index) => ({
            date: `2026-08-${String(index + 10).padStart(2, "0")}` as ISODate,
            occurrenceId: null,
            completed: false
          }))
        ]
      }]
    };
    const html = await renderChartHtml(snapshot, "abcdef0123456789");
    expect(html).toContain("@page { size: Letter portrait");
    expect(html).toContain('data-occurrence-id="occurrence-1"');
    expect(html).toContain("data:image/png;base64");
    expect(html).toContain("Chart chart-id");
    expect(html).toContain("theme-space");
    expect(html).toContain("Layout v1");
  });

  it.each(["italy", "cats", "shark", "shark-dino"])("renders the %s print theme", async (themeKey) => {
    const snapshot: ChartSnapshot = {
      chartId: `chart-${themeKey}`,
      householdName: "Test Family",
      memberId: "member-id",
      memberName: "Alex",
      weekStartDate: "2026-08-09",
      themeKey,
      planRevision: 1,
      rows: []
    };

    const html = await renderChartHtml(snapshot, "abcdef0123456789");
    expect(html).toContain(`chart-page theme-${themeKey}`);
    expect(html).toContain(`.theme-${themeKey}`);
  });

  it.each([
    ["cats", "PAWS, CHECKS &amp; PROUD MOMENTS"],
    ["shark-dino", "THE PREHISTORIC OCEAN CREW"]
  ])("embeds the %s storybook artwork in the deterministic chart", async (themeKey, kicker) => {
    const snapshot: ChartSnapshot = {
      chartId: `chart-${themeKey}`,
      householdName: "Test Family",
      memberId: "member-id",
      memberName: themeKey === "cats" ? "Kate" : "Henry",
      weekStartDate: "2026-08-09",
      themeKey,
      planRevision: 1,
      rows: []
    };

    const html = await renderChartHtml(snapshot, "abcdef0123456789");
    expect(html).toContain('class="theme-art"');
    expect(html).toContain("data:image/webp;base64");
    expect(html).toContain(kicker);
  });
});

it("prints saved lessons with credits and reserves room across page boundaries", async () => {
  const snapshot: ChartSnapshot = { chartId: "test", householdName: "Family", memberId: "kate", memberName: "Kate",
    weekStartDate: "2026-09-13", themeKey: "cats", planRevision: 1, layoutVersion: 2,
    speciesLesson: { ...weeklySpeciesLesson("cats", "2026-09-13")!, photo: {
      dataUrl: "data:image/jpeg;base64,cGhvdG8=", credit: "Photographer & friend", license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", pageUrl: "https://commons.wikimedia.org/wiki/File:cat.jpg"
    } }, rows: Array.from({ length: 13 }, (_, index) => ({ key: String(index), title: `Chore ${index}`, routineName: null, cells: [] })) };
  const html = await renderChartHtml(snapshot, "checksum");
  expect(html.match(/<section class="chart-page/g)).toHaveLength(2);
  expect(html.match(/<aside class="species-card/g)).toHaveLength(2);
  expect(html).toContain("Sand cat");
  expect(html).toContain("Photographer &amp; friend");
  expect(html).toContain("Wonder together:");
  expect(html).toContain("Layout v2 · 2/2");
  delete snapshot.speciesLesson;
  delete snapshot.layoutVersion;
  const legacy = await renderChartHtml(snapshot, "checksum");
  expect(legacy.match(/<section class="chart-page/g)).toHaveLength(1);
  expect(legacy).not.toContain('<aside class="species-card');
});
