import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@chore-tracker/domain",
    "@chore-tracker/contracts",
    "@chore-tracker/database"
  ],
  serverExternalPackages: ["better-sqlite3", "playwright"]
};

export default nextConfig;
