import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrations } from "./migrations";

type SqliteDatabase = InstanceType<typeof Database>;

declare global {
  // eslint-disable-next-line no-var
  var __choreTrackerSqlite: SqliteDatabase | undefined;
}

function defaultDatabasePath(): string {
  const fromWebWorkspace = process.cwd().replaceAll("\\", "/").endsWith("/apps/web");
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), fromWebWorkspace ? "../../.local/dev/app.sqlite" : ".local/dev/app.sqlite");
}

export function databasePath(): string {
  const resolved = path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || defaultDatabasePath());
  const appEnv = process.env.APP_ENV || "development";
  if (appEnv === "production") {
    if (!path.isAbsolute(process.env.DATABASE_PATH || "") || resolved.includes(`${path.sep}.local${path.sep}`)) {
      throw new Error("Production DATABASE_PATH must be an explicit absolute production path");
    }
  } else if (resolved.includes(`${path.sep}prod${path.sep}`)) {
    throw new Error("A non-production process may not use a production data path");
  }
  return resolved;
}

export function openDatabase(filename = databasePath()): SqliteDatabase {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o750 });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function migrateDatabase(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version)
  );
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function getSqlite(): SqliteDatabase {
  if (!globalThis.__choreTrackerSqlite) {
    globalThis.__choreTrackerSqlite = openDatabase();
    migrateDatabase(globalThis.__choreTrackerSqlite);
  }
  return globalThis.__choreTrackerSqlite;
}

export function withImmediateTransaction<T>(db: SqliteDatabase, work: () => T): T {
  // better-sqlite3 uses savepoints when an application operation composes services.
  return db.transaction(work).immediate();
}

export type { SqliteDatabase };
