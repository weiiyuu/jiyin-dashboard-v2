import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, transaction, type AppDatabase } from "@/server/db/connection";
import { applyMigrations, currentSchemaVersion, migrations } from "@/server/db/migrations";
import { createPollRun, latestCollectionSuccessMs, persistSuccessfulValues } from "@/server/db/poll-repository";
import { getSettings, switchProviderMode } from "@/server/db/settings-repository";
import { backupDatabase } from "@/server/db/backup";
import { explainActiveMachineQuery } from "@/server/db/history-repository";

const roots: string[] = [];
const dbs: AppDatabase[] = [];

function databasePath() {
  const root = mkdtempSync(join(tmpdir(), "jiyin-db-test-"));
  roots.push(root);
  return join(root, "test.sqlite");
}

function setup(path = databasePath()) {
  const db = openDatabase(path);
  dbs.push(db);
  applyMigrations(db);
  return db;
}

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("SQLite schema and migrations", () => {
  it("creates exactly the approved 16 tables and is idempotent", () => {
    const db = setup();
    applyMigrations(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toHaveLength(16);
    expect(currentSchemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT COUNT(*) count FROM machines").get()).toEqual({ count: 8 });
  });

  it("enforces STRICT types, foreign keys, and one active batch per source date", () => {
    const db = setup();
    expect(() => db.prepare("UPDATE app_settings SET mode_revision='bad' WHERE singleton_id=1").run()).toThrow();
    expect(() => db.prepare(`INSERT INTO live_sensor_readings(
      poll_run_id,sensor_id,fetched_at_ms,raw_values_json,parse_status,mapping_status
    ) VALUES(999,'x',1,'{}','VALID','UNMAPPED')`).run()).toThrow(/FOREIGN KEY/);
    const add = db.prepare(`INSERT INTO import_batches(
      source_date,original_file_name,file_size_bytes,file_sha256,canonical_fingerprint,contract_version,
      alarm_source_status,status,created_at_ms
    ) VALUES('2025-06-01',?,1,?,?,'jiyin-v1-draft','PROVIDED_EMPTY','ACTIVE',1)`);
    add.run("a.xlsx", "sha-a", "fp-a");
    expect(() => add.run("b.xlsx", "sha-b", "fp-b")).toThrow(/UNIQUE/);
  });

  it("rolls back application transactions and a failed migration step", () => {
    const db = setup();
    expect(() => transaction(db, () => {
      db.prepare("UPDATE app_settings SET stale_after_seconds=100 WHERE singleton_id=1").run();
      throw new Error("injected");
    })).toThrow("injected");
    expect(getSettings(db).staleAfterSeconds).toBe(420);

    const bad = { version: 2, name: "injected_failure", sql: "CREATE TABLE transient_test(id INTEGER) STRICT; INVALID SQL;" };
    expect(() => applyMigrations(db, [...migrations, bad])).toThrow();
    expect(currentSchemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='transient_test'").get()).toBeUndefined();
  });

  it("uses WAL and permits a reader while another connection has an uncommitted write", () => {
    const path = databasePath();
    const writer = setup(path);
    const reader = openDatabase(path);
    dbs.push(reader);
    expect(writer.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(writer.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(writer.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    writer.exec("BEGIN IMMEDIATE");
    writer.prepare("UPDATE app_settings SET stale_after_seconds=421 WHERE singleton_id=1").run();
    expect(getSettings(reader).staleAfterSeconds).toBe(420);
    writer.exec("COMMIT");
    expect(getSettings(reader).staleAfterSeconds).toBe(421);
  });

  it("serializes competing BEGIN IMMEDIATE writers without corrupting data", () => {
    const path = databasePath();
    const first = setup(path);
    const second = openDatabase(path);
    dbs.push(second);
    second.exec("PRAGMA busy_timeout=20");
    first.exec("BEGIN IMMEDIATE");
    first.prepare("UPDATE app_settings SET stale_after_seconds=422 WHERE singleton_id=1").run();
    expect(() => second.exec("BEGIN IMMEDIATE")).toThrow(/locked/);
    first.exec("ROLLBACK");
    expect(getSettings(second).staleAfterSeconds).toBe(420);
  });

  it("creates a consistent backup that can be reopened", async () => {
    const db = setup();
    db.prepare("UPDATE app_settings SET stale_after_seconds=777 WHERE singleton_id=1").run();
    const destination = join(roots.at(-1)!, "backup.sqlite");
    await backupDatabase(db, destination);
    const restored = openDatabase(destination);
    dbs.push(restored);
    expect(getSettings(restored).staleAfterSeconds).toBe(777);
    expect(currentSchemaVersion(restored)).toBe(1);
  });

  it("keeps the active machine range query on its approved indexes", () => {
    const db = setup();
    const plan = explainActiveMachineQuery(db, "A1", 0, 1_000_000).join(" ");
    expect(plan).toMatch(/idx_machine_query/);
    expect(plan).toMatch(/SEARCH b USING INTEGER PRIMARY KEY/);
  });
});

describe("repository concurrency rules", () => {
  it("never persists readings in DEMO mode", () => {
    const db = setup();
    const pollRunId=createPollRun(db,{batchTimeText:"demo",batchTimeMs:1,sampleSlotMs:1,scheduledForMs:1,startedAtMs:1,providerMode:"DEMO",modeRevision:0,withinServiceWindow:true,triggerType:"SCHEDULED"});
    expect(persistSuccessfulValues(db,{pollRunId,providerModeAtStart:"DEMO",modeRevisionAtStart:0,finishedAtMs:2,readings:[{sensorId:"s1",sensorUpdateAtMs:1,fetchedAtMs:1,rawValues:{value:"1"}}]})).toBe("DISCARDED_MODE_CHANGED");
    expect(db.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get()).toEqual({count:0});
  });

  it("does not declare collection success when no reading was saved", () => {
    const db=setup();
    switchProviderMode(db,"LIVE",0,1);
    const pollRunId=createPollRun(db,{batchTimeText:"live",batchTimeMs:1,sampleSlotMs:1,scheduledForMs:1,startedAtMs:1,providerMode:"LIVE",modeRevision:1,withinServiceWindow:true,triggerType:"SCHEDULED"});
    expect(persistSuccessfulValues(db,{pollRunId,providerModeAtStart:"LIVE",modeRevisionAtStart:1,finishedAtMs:2,readings:[]})).toBe("FAILED_NO_READINGS");
    expect(db.prepare("SELECT status,persisted_reading_count FROM api_poll_runs WHERE poll_run_id=?").get(pollRunId)).toEqual({status:"FAILED",persisted_reading_count:0});
  });

  it("uses compare-before-write to discard a collection after mode revision changes", () => {
    const db = setup();
    const start = getSettings(db);
    const pollRunId = createPollRun(db, {
      batchTimeText: "2026-11-14T10:00:00+08:00", batchTimeMs: 1, sampleSlotMs: 1,
      scheduledForMs: 1, startedAtMs: 1, providerMode: start.providerMode,
      modeRevision: start.modeRevision, withinServiceWindow: true, triggerType: "SCHEDULED",
    });
    switchProviderMode(db, "LIVE", start.modeRevision, 2);
    expect(persistSuccessfulValues(db, {
      pollRunId, providerModeAtStart: start.providerMode, modeRevisionAtStart: start.modeRevision,
      finishedAtMs: 3, readings: [{ sensorId: "s1", sensorUpdateAtMs: 1, fetchedAtMs: 2, rawValues: { value: "1" } }],
    })).toBe("DISCARDED_MODE_CHANGED");
    expect(db.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) count FROM api_endpoint_runs").get()).toEqual({ count: 0 });
  });

  it("keeps MANUAL_TEST separate from collection success", () => {
    const db = setup();
    createPollRun(db, {
      batchTimeText: "manual", batchTimeMs: 1, sampleSlotMs: null, scheduledForMs: null,
      startedAtMs: 1, providerMode: "DEMO", modeRevision: 0,
      withinServiceWindow: true, triggerType: "MANUAL_TEST",
    });
    db.prepare("UPDATE api_poll_runs SET status='SUCCESS', finished_at_ms=2, persisted_reading_count=0").run();
    expect(latestCollectionSuccessMs(db)).toBeNull();
  });
});
