import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@chore-tracker/domain": path.resolve(import.meta.dirname, "packages/domain/src/index.ts"),
      "@chore-tracker/contracts": path.resolve(import.meta.dirname, "packages/contracts/src/index.ts"),
      "@chore-tracker/database": path.resolve(import.meta.dirname, "packages/database/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "ops/**/*.test.ts"]
  }
});
