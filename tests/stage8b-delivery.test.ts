import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseBackup, restoreDatabaseBackup } from "@/server/db/backup";
import { openDatabase, type AppDatabase } from "@/server/db/connection";
import { applyMigrations, currentSchemaVersion } from "@/server/db/migrations";
import { cleanupLiveRetention, createPollRun, persistSuccessfulValues } from "@/server/db/poll-repository";
import { getSettings, switchProviderMode } from "@/server/db/settings-repository";

const roots: string[] = [];
const open: AppDatabase[] = [];

function isolatedPaths() {
  const root = mkdtempSync(join(tmpdir(), "jiyin-stage8b-"));
  roots.push(root);
  return { database: join(root, "runtime.sqlite"), backup: join(root, "backups", "snapshot.sqlite") };
}

function database(path: string) {
  const db = openDatabase(path);
  open.push(db);
  applyMigrations(db);
  return db;
}

function close(db: AppDatabase) {
  db.close();
  open.splice(open.indexOf(db), 1);
}

function seedLiveAndHistory(db: AppDatabase) {
  db.prepare(`INSERT INTO import_batches(
    source_date,original_file_name,file_size_bytes,file_sha256,canonical_fingerprint,
    contract_version,alarm_source_status,status,created_at_ms
  ) VALUES('2025-06-01','synthetic.xlsx',1,'synthetic-sha','synthetic-fingerprint',
    'stage8b-test','PROVIDED_EMPTY','ACTIVE',1)`).run();
  const live = switchProviderMode(db, "LIVE", getSettings(db).modeRevision, 1);
  const pollRunId = createPollRun(db, {
    batchTimeText: "2026-11-16T10:00:00+08:00",
    batchTimeMs: 100,
    sampleSlotMs: 100,
    scheduledForMs: 100,
    startedAtMs: 100,
    providerMode: "LIVE",
    modeRevision: live.modeRevision,
    withinServiceWindow: true,
    triggerType: "SCHEDULED",
  });
  expect(persistSuccessfulValues(db, {
    pollRunId,
    providerModeAtStart: "LIVE",
    modeRevisionAtStart: live.modeRevision,
    finishedAtMs: 101,
    readings: [{ sensorId: "synthetic-sensor", sensorUpdateAtMs: 100, fetchedAtMs: 100, rawValues: { value: "1" } }],
  })).toBe("SUCCESS");
}

afterEach(() => {
  while (open.length) open.pop()!.close();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Stage 8B SQLite delivery", () => {
  it("persists Live and imported history across close/reopen, then restores a consistent WAL backup", async () => {
    const paths = isolatedPaths();
    const first = database(paths.database);
    seedLiveAndHistory(first);

    await createDatabaseBackup(paths.database, paths.backup);
    expect(existsSync(paths.backup)).toBe(true);

    first.prepare("DELETE FROM import_batches").run();
    first.prepare("UPDATE app_settings SET stale_after_seconds=999").run();
    close(first);

    const reopened = database(paths.database);
    expect(reopened.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get()).toEqual({ count: 1 });
    expect(reopened.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({ count: 0 });
    close(reopened);

    const result = await restoreDatabaseBackup(paths.backup, paths.database, { confirmedStopped: true });
    expect(result.previousDatabasePath).not.toBeNull();
    expect(existsSync(result.previousDatabasePath!)).toBe(true);

    const restored = database(paths.database);
    expect(currentSchemaVersion(restored)).toBe(2);
    expect(getSettings(restored)).toMatchObject({ staleAfterSeconds: 420, liveRetentionDays: 3 });
    expect(restored.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get()).toEqual({ count: 1 });
    expect(restored.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({ count: 1 });
    expect(restored.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });

    cleanupLiveRetention(restored, 200);
    expect(restored.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get()).toEqual({ count: 0 });
    expect(restored.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({ count: 1 });
  });

  it("refuses restore without explicit stop confirmation or while a Collector lock exists", async () => {
    const paths = isolatedPaths();
    const db = database(paths.database);
    seedLiveAndHistory(db);
    await createDatabaseBackup(paths.database, paths.backup);
    close(db);

    await expect(restoreDatabaseBackup(paths.backup, paths.database, { confirmedStopped: false }))
      .rejects.toThrow(/confirm-stopped/);
    writeFileSync(`${paths.database}.collector.pid`, "12345", "utf8");
    await expect(restoreDatabaseBackup(paths.backup, paths.database, { confirmedStopped: true }))
      .rejects.toThrow(/Collector lock/);
  });
});
