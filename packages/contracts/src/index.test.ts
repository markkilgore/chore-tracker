import { describe, expect, it } from "vitest";
import { chartExportSchema, createMemberSchema, themeKeySchema, updateMemberSchema } from "./index";

describe("theme contracts", () => {
  it.each(["sunny", "space", "ocean", "italy", "cats", "shark"])("accepts the %s theme", (themeKey) => {
    expect(themeKeySchema.parse(themeKey)).toBe(themeKey);
    expect(createMemberSchema.parse({ displayName: "Alex", kind: "CHILD", themeKey }).themeKey).toBe(themeKey);
    expect(updateMemberSchema.parse({ themeKey }).themeKey).toBe(themeKey);
    expect(chartExportSchema.parse({
      weeklyPlanId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      themeKey
    }).themeKey).toBe(themeKey);
  });

  it("rejects unknown themes", () => {
    expect(() => themeKeySchema.parse("mystery")).toThrow();
  });
});
