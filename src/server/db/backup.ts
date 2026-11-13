import { backup, type DatabaseSync } from "node:sqlite";

export async function backupDatabase(source: DatabaseSync, destinationPath: string): Promise<number> {
  if (!destinationPath.endsWith(".sqlite") && !destinationPath.endsWith(".db")) {
    throw new Error("Backup destination must be a SQLite file");
  }
  return backup(source, destinationPath);
}
