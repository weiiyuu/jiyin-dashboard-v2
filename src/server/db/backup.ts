import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export interface RestoreResult {
  restoredDatabasePath: string;
  previousDatabasePath: string | null;
}

function assertSqliteFile(path: string, label: string) {
  if (!path.endsWith(".sqlite") && !path.endsWith(".db")) {
    throw new Error(`${label} must be a .sqlite or .db file`);
  }
}

function integrityCheck(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    if (result?.integrity_check !== "ok") throw new Error(`SQLite integrity check failed for ${path}`);
  } finally {
    db.close();
  }
}

function partialPath(path: string, label: string) {
  return `${path}.${label}-${process.pid}-${Date.now()}.sqlite`;
}

export async function backupDatabase(source: DatabaseSync, destinationPath: string): Promise<number> {
  assertSqliteFile(destinationPath, "Backup destination");
  return backup(source, destinationPath);
}

export async function createDatabaseBackup(databasePath: string, destinationPath: string): Promise<number> {
  const sourcePath = resolve(databasePath);
  const targetPath = resolve(destinationPath);
  assertSqliteFile(sourcePath, "Database source");
  assertSqliteFile(targetPath, "Backup destination");
  if (sourcePath === targetPath) throw new Error("Backup destination must differ from the source database");
  if (!existsSync(sourcePath)) throw new Error(`Database does not exist: ${sourcePath}`);
  if (existsSync(targetPath)) throw new Error(`Backup destination already exists: ${targetPath}`);

  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = partialPath(targetPath, "partial");
  const source = new DatabaseSync(sourcePath);
  try {
    source.exec("PRAGMA busy_timeout = 5000");
    const pages = await backupDatabase(source, temporaryPath);
    integrityCheck(temporaryPath);
    renameSync(temporaryPath, targetPath);
    return pages;
  } catch (error) {
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); } catch {}
    throw error;
  } finally {
    source.close();
  }
}

export async function restoreDatabaseBackup(
  backupPath: string,
  databasePath: string,
  options: { confirmedStopped: boolean },
): Promise<RestoreResult> {
  if (!options.confirmedStopped) {
    throw new Error("Restore requires --confirm-stopped after Web and Collector are stopped");
  }
  const sourcePath = resolve(backupPath);
  const targetPath = resolve(databasePath);
  assertSqliteFile(sourcePath, "Backup source");
  assertSqliteFile(targetPath, "Restore destination");
  if (sourcePath === targetPath) throw new Error("Backup source must differ from the restore destination");
  if (!existsSync(sourcePath)) throw new Error(`Backup does not exist: ${sourcePath}`);
  if (existsSync(`${targetPath}.collector.pid`)) throw new Error("Collector lock exists; stop the Collector before restore");
  if (existsSync(`${targetPath}-wal`) || existsSync(`${targetPath}-shm`)) {
    throw new Error("SQLite WAL/SHM sidecar exists; stop all database users cleanly before restore");
  }

  integrityCheck(sourcePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = partialPath(targetPath, "restore");
  const previousPath = existsSync(targetPath) ? partialPath(targetPath, "pre-restore") : null;
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let movedPrevious = false;
  try {
    await backupDatabase(source, temporaryPath);
    integrityCheck(temporaryPath);
    if (previousPath) {
      renameSync(targetPath, previousPath);
      movedPrevious = true;
    }
    renameSync(temporaryPath, targetPath);
    return { restoredDatabasePath: targetPath, previousDatabasePath: previousPath };
  } catch (error) {
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); } catch {}
    if (movedPrevious && previousPath && !existsSync(targetPath)) renameSync(previousPath, targetPath);
    throw error;
  } finally {
    source.close();
  }
}
