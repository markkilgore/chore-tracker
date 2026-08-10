export const THEME_KEYS = ["sunny", "space", "ocean", "italy", "cats", "shark"] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

const THEME_LABELS: Record<ThemeKey, string> = {
  sunny: "Sunny",
  space: "Space",
  ocean: "Ocean",
  italy: "Italy",
  cats: "Cats",
  shark: "Sharks"
};

export const THEME_OPTIONS = THEME_KEYS.map((key) => ({ key, label: THEME_LABELS[key] }));
