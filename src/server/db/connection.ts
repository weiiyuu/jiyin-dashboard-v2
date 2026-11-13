import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export type AppDatabase = DatabaseSync;

export function openDatabase(path: string): AppDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function transaction<T>(db: AppDatabase, operation: () => T, mode: "DEFERRED" | "IMMEDIATE" = "IMMEDIATE"): T {
  db.exec(`BEGIN ${mode}`);
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
