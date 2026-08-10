import { describe, expect, it } from "vitest";
import { renderChartHtml } from "./chart-renderer";
import type { ChartSnapshot } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";

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
});
