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
import { confirmImport } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { standardizedWorkbook } from "./fixtures/standardized-workbook";

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
    expect(currentSchemaVersion(db)).toBe(2);
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

    const bad = { version: 3, name: "injected_failure", sql: "CREATE TABLE transient_test(id INTEGER) STRICT; INVALID SQL;" };
    expect(() => applyMigrations(db, [...migrations, bad])).toThrow();
    expect(currentSchemaVersion(db)).toBe(2);
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
    expect(currentSchemaVersion(restored)).toBe(2);
  });

  it("migrates a non-empty v1 database without losing versions, rows, indexes, or foreign keys",()=>{
    const path=databasePath(),db=openDatabase(path);dbs.push(db);applyMigrations(db,[migrations[0]]);
    const sheets=standardizedWorkbook("2025-06-04");
    sheets[2].data.push(["2025-06-04 00:54:00","sensor","sensor-1","analog","B","rule","value>1",1,null,null,null]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    const preview=parseWorkbookSheets(sheets,Buffer.from("v1-non-empty"));
    const first=confirmImport(db,preview,{nowMs:1}) as {batchId:number};
    const revision=structuredClone(preview);revision.fileSha256="v1-revision";revision.canonicalFingerprint="v1-revision";
    const second=confirmImport(db,revision,{replace:true,expectedActiveBatchId:first.batchId,nowMs:2}) as {batchId:number};
    db.prepare("UPDATE history_machine_intervals SET quality_rule_version='jiyin-quality-v1',green_hours_eligible=1,six_state_share_eligible=1,transition_eligible=1,source_quality_note='來源秒數嚴重不足'").run();
    const insertQuality=db.prepare("INSERT INTO history_quality_issues(batch_id,source_row_number,source_date,time_label,subject_text,problem_text,interval_total_seconds) VALUES(?,2,'2025-06-04','24:00','A1','六態秒數嚴重不足',0.06)");
    insertQuality.run(first.batchId);insertQuality.run(second.batchId);

    applyMigrations(db);

    expect(currentSchemaVersion(db)).toBe(2);
    expect(db.prepare("SELECT status,COUNT(*) count FROM import_batches GROUP BY status ORDER BY status").all()).toEqual([{status:"ACTIVE",count:1},{status:"REPLACED",count:1}]);
    expect(db.prepare("SELECT COUNT(*) count FROM history_alarm_events").get()).toEqual({count:2});
    expect(db.prepare("SELECT green_hours_eligible,six_state_share_eligible,transition_eligible,quality_rule_version FROM history_machine_intervals LIMIT 1").get()).toEqual({green_hours_eligible:0,six_state_share_eligible:0,transition_eligible:0,quality_rule_version:"jiyin-quality-v2"});
    db.prepare("UPDATE history_alarm_events SET sensor_name=NULL,sensor_type=NULL,rule_name=NULL,rule_condition_text=NULL").run();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({integrity_check:"ok"});
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_alarm_type_rule'").get()).toEqual({name:"idx_alarm_type_rule"});
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
