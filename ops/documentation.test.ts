import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const documents = [
  path.join(root, "README.md"),
  ...fs.readdirSync(path.join(root, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(root, "docs", name))
];

describe("documentation", () => {
  it("keeps every relative Markdown link valid", () => {
    const missing: string[] = [];

    for (const document of documents) {
      const markdown = fs.readFileSync(document, "utf8");
      for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].split("#", 1)[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

        const resolved = path.resolve(path.dirname(document), decodeURIComponent(target));
        if (!fs.existsSync(resolved)) {
          missing.push(`${path.relative(root, document)} -> ${target}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("does not revive superseded production paths or ports", () => {
    const combined = documents.map((document) => fs.readFileSync(document, "utf8")).join("\n");
    expect(combined).not.toContain("/opt/family-chore-tracker");
    expect(combined).not.toContain("127.0.0.1:8080");
    expect(combined).not.toContain("localhost:3000");
  });
});
