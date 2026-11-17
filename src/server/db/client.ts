import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "audit-tool.sqlite");

// turbopackIgnore: these paths are statically scoped under ./data and only
// ever touched at runtime (never during the build), but Turbopack's static
// analysis can't tell that from a dynamic fs call — tell it not to trace here.
if (!existsSync(/* turbopackIgnore: true */ DATA_DIR)) {
  mkdirSync(/* turbopackIgnore: true */ DATA_DIR, { recursive: true });
}

declare global {
  // eslint-disable-next-line no-var
  var __auditToolSqlite: Database.Database | undefined;
}

const sqlite = globalThis.__auditToolSqlite ?? new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") {
  globalThis.__auditToolSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export const REPORTS_DIR = path.join(DATA_DIR, "reports");
export const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
export const RAW_DIR = path.join(DATA_DIR, "raw");

for (const dir of [REPORTS_DIR, SCREENSHOTS_DIR, RAW_DIR]) {
  if (!existsSync(/* turbopackIgnore: true */ dir)) mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
}
