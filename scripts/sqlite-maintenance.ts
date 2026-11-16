import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabaseBackup, restoreDatabaseBackup } from "../src/server/db/backup";
import { openDatabase } from "../src/server/db/connection";
import { applyMigrations, currentSchemaVersion } from "../src/server/db/migrations";

type Command = "init" | "backup" | "restore";

function databasePath(raw = process.env.DATABASE_PATH) {
  const value = raw?.trim() || "data/jiyin-dashboard.sqlite";
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function runSqliteMaintenance(command: Command) {
  const target = databasePath(option("--database"));
  if (command === "init") {
    mkdirSync(dirname(target), { recursive: true });
    const db = openDatabase(target);
    try {
      applyMigrations(db);
      console.log(`[sqlite] schema v${currentSchemaVersion(db)} ready at ${target}`);
    } finally {
      db.close();
    }
    return;
  }

  if (command === "backup") {
    const output = resolve(option("--output") ?? `backups/jiyin-dashboard-${timestamp()}.sqlite`);
    const pages = await createDatabaseBackup(target, output);
    console.log(`[sqlite] consistent backup created (${pages} pages): ${output}`);
    return;
  }

  const input = option("--input");
  if (!input) throw new Error("Restore requires --input <backup.sqlite>");
  const result = await restoreDatabaseBackup(resolve(input), target, {
    confirmedStopped: process.argv.includes("--confirm-stopped"),
  });
  console.log(`[sqlite] restored: ${result.restoredDatabasePath}`);
  if (result.previousDatabasePath) console.log(`[sqlite] previous database retained: ${result.previousDatabasePath}`);
}

const requested = process.argv[2] as Command | undefined;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!requested || !["init", "backup", "restore"].includes(requested)) {
    throw new Error("Usage: sqlite-maintenance.ts <init|backup|restore> [options]");
  }
  await runSqliteMaintenance(requested);
}
