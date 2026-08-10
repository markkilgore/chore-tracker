import fs from "node:fs";
import path from "node:path";
import { databasePath, migrateDatabase, openDatabase } from "./db";
import { seedDemo } from "./service";

const command = process.argv[2];
const filename = databasePath();
const db = openDatabase(filename);

try {
  if (command === "migrate") {
    migrateDatabase(db);
    console.log(`Migrated ${filename}`);
  } else if (command === "seed") {
    if ((process.env.APP_ENV || "development") === "production") throw new Error("Refusing to seed production");
    migrateDatabase(db);
    console.log(`Seeded household ${seedDemo(db)}`);
  } else if (command === "check") {
    migrateDatabase(db);
    const result = db.pragma("quick_check") as Array<{ quick_check: string }>;
    if (result[0]?.quick_check !== "ok") throw new Error(`SQLite integrity check failed: ${JSON.stringify(result)}`);
    console.log(`SQLite integrity check passed: ${filename}`);
  } else if (command === "backup") {
    migrateDatabase(db);
    const target = path.resolve(process.argv[3] || `${filename}.${new Date().toISOString().replaceAll(":", "-")}.backup`);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
    await db.backup(target);
    console.log(`Created consistent backup ${target}`);
  } else {
    throw new Error("Usage: cli.ts <migrate|seed|check|backup> [backup-path]");
  }
} finally {
  db.close();
}
