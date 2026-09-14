import { describe, expect, it } from "vitest";
import { addDays, weeklySpeciesLesson } from "../index";

describe("weekly species lessons", () => {
  it.each(["cats", "shark", "shark-dino"])("rotates 24 distinct lessons for %s, with eight matching species", (theme) => {
    const lessons = Array.from({ length: 24 }, (_, week) => weeklySpeciesLesson(theme, addDays("2026-09-13", week * 7))!);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(24);
    expect(new Set(lessons.map((lesson) => lesson.speciesId)).size).toBe(8);
    expect(lessons.every((lesson) => lesson.theme === (theme === "cats" ? "cats" : "sharks"))).toBe(true);
    expect(weeklySpeciesLesson(theme, addDays("2026-09-13", 168))).toEqual(lessons[0]);
    expect(weeklySpeciesLesson(theme, "2026-09-12")).toEqual(lessons[23]);
    expect(weeklySpeciesLesson(theme, "2026-09-19")).toEqual(lessons[0]);
  });
  it("uses the theme rather than the child's name and leaves other themes alone", () => {
    expect(weeklySpeciesLesson("shark", "2026-09-13")).toEqual(weeklySpeciesLesson("shark-dino", "2026-09-13"));
    expect(weeklySpeciesLesson("sunny", "2026-09-13")).toBeNull();
  });
});
