import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

// The same relative path holds from src/server/db and from dist/server/db.
const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export function openDatabase(filename: string): Db {
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
