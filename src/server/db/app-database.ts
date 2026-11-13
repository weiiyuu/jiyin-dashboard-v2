import "server-only";
import { openDatabase } from "./connection";
import { applyMigrations } from "./migrations";

export function openAppDatabase() {
  const path = process.env.DATABASE_PATH ?? "data/jiyin-dashboard.sqlite";
  const db = openDatabase(path);
  applyMigrations(db);
  return db;
}
