import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const dev = fs.readFileSync(path.join(root, "ops/compose/compose.dev.yml"), "utf8");
const prod = fs.readFileSync(path.join(root, "ops/compose/compose.prod.yml"), "utf8");

describe("development and production isolation", () => {
  it("uses distinct ports and data paths", () => {
    expect(dev).toContain("127.0.0.1:3010:3010");
    expect(dev).toContain("../../.local/dev:/data");
    expect(prod).toContain("TIDY_HOST_PORT:-8788");
    expect(prod).toContain("TIDY_DATA_DIR");
    expect(prod).not.toContain(".local/dev");
  });

  it("never mounts the active source tree in production", () => {
    expect(dev).toContain("../..:/app");
    expect(prod).not.toContain("../..:/app");
    expect(prod).toContain("tidy-week:${APP_IMAGE_TAG");
  });

  it("uses explicit environment identities", () => {
    expect(dev).toContain("APP_ENV: development");
    expect(prod).toContain("APP_ENV: production");
  });
});
