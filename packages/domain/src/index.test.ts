import { describe, expect, it } from "vitest";
import {
  addDays,
  dateInTimeZone,
  datesForRuleInWeek,
  generateWeekOccurrences,
  rotationIndexForDate,
  startOfWeek,
  type ResponsibilityTemplate
} from "./index";

const dailyRule = {
  kind: "weekly_days" as const,
  anchorDate: "2026-08-02" as const,
  intervalWeeks: 1,
  weekdays: [0, 1, 2, 3, 4, 5, 6] as const
};

describe("calendar scheduling", () => {
  it("uses Sunday week boundaries across years", () => {
    expect(startOfWeek("2027-01-01")).toBe("2026-12-27");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("keeps local dates stable over DST changes", () => {
    expect(dateInTimeZone(new Date("2026-03-08T07:30:00Z"), "America/Los_Angeles")).toBe("2026-03-07");
    expect(dateInTimeZone(new Date("2026-03-08T10:30:00Z"), "America/Los_Angeles")).toBe("2026-03-08");
  });

  it("supports interval weeks and selected weekdays", () => {
    const rule = { ...dailyRule, intervalWeeks: 2, weekdays: [1, 3, 5] as const };
    expect(datesForRuleInWeek(rule, "2026-08-02")).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
    expect(datesForRuleInWeek(rule, "2026-08-09")).toEqual([]);
  });

  it("rotates independently of materialization order", () => {
    expect(rotationIndexForDate(dailyRule, "2026-08-02", 3)).toBe(0);
    expect(rotationIndexForDate(dailyRule, "2026-08-12", 3)).toBe(1);
    expect(rotationIndexForDate(dailyRule, "2026-08-12", 3)).toBe(1);
  });

  it("generates independent occurrences from one chore definition", () => {
    const base: Omit<ResponsibilityTemplate, "id" | "allocation"> = {
      choreDefinitionId: "make-bed",
      choreTitle: "Make bed",
      choreKind: "INDIVIDUAL",
      sortOrder: 1,
      activeFrom: "2026-08-02",
      recurrence: dailyRule
    };
    const result = generateWeekOccurrences([
      { ...base, id: "kate-bed", allocation: { kind: "fixed", memberId: "kate" } },
      { ...base, id: "henry-bed", allocation: { kind: "fixed", memberId: "henry" } }
    ], "2026-08-09");
    expect(result).toHaveLength(14);
    expect(new Set(result.map((row) => row.choreDefinitionId))).toEqual(new Set(["make-bed"]));
  });
});
