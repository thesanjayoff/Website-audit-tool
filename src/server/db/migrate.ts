import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

migrate(db, { migrationsFolder: "./src/server/db/migrations" });
// eslint-disable-next-line no-console
console.log("Migrations applied.");
