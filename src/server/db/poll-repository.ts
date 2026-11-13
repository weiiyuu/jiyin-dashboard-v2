import type { AppDatabase } from "./connection";
import { transaction } from "./connection";

export interface PollStart {
  batchTimeText: string;
  batchTimeMs: number;
  sampleSlotMs: number | null;
  scheduledForMs: number | null;
  startedAtMs: number;
  providerMode: "LIVE" | "DEMO";
  modeRevision: number;
  withinServiceWindow: boolean;
  triggerType: "STARTUP" | "SCHEDULED" | "MODE_RESUME" | "MANUAL_TEST";
}

export function createPollRun(db: AppDatabase, input: PollStart): number {
  if (input.triggerType === "MANUAL_TEST" && input.sampleSlotMs !== null) throw new Error("MANUAL_TEST cannot have sample slot");
  const result = db.prepare(`INSERT INTO api_poll_runs(
    batch_time_text,batch_time_ms,sample_slot_ms,scheduled_for_ms,started_at_ms,
    provider_mode_at_start,mode_revision_at_start,within_service_window,trigger_type,status
  ) VALUES(?,?,?,?,?,?,?,?,?,'RUNNING')`).run(
    input.batchTimeText, input.batchTimeMs, input.sampleSlotMs, input.scheduledForMs, input.startedAtMs,
    input.providerMode, input.modeRevision, input.withinServiceWindow ? 1 : 0, input.triggerType,
  );
  return Number(result.lastInsertRowid);
}

export interface ReadingInput {
  sensorId: string;
  sensorUpdateAtMs: number | null;
  fetchedAtMs: number;
  rawValues: Record<string, unknown>;
  numericValue?: number | null;
}

export function persistSuccessfulValues(
  db: AppDatabase,
  input: { pollRunId: number; providerModeAtStart: "LIVE" | "DEMO"; modeRevisionAtStart: number; finishedAtMs: number; readings: ReadingInput[] },
): "SUCCESS" | "DISCARDED_MODE_CHANGED" {
  return transaction(db, () => {
    const settings = db.prepare("SELECT provider_mode, mode_revision FROM app_settings WHERE singleton_id=1").get() as {
      provider_mode: string; mode_revision: number;
    };
    if (settings.provider_mode !== input.providerModeAtStart || settings.mode_revision !== input.modeRevisionAtStart) {
      db.prepare(`UPDATE api_poll_runs SET status='DISCARDED_MODE_CHANGED', finished_at_ms=?, persisted_reading_count=0
        WHERE poll_run_id=? AND status='RUNNING'`).run(input.finishedAtMs, input.pollRunId);
      return "DISCARDED_MODE_CHANGED";
    }
    const poll = db.prepare("SELECT trigger_type FROM api_poll_runs WHERE poll_run_id=? AND status='RUNNING'").get(input.pollRunId) as { trigger_type: string } | undefined;
    if (!poll) throw new Error("Poll is not running");
    if (poll.trigger_type === "MANUAL_TEST") throw new Error("MANUAL_TEST cannot persist readings");
    const insertReading = db.prepare(`INSERT INTO live_sensor_readings(
      poll_run_id,sensor_id,sensor_update_at_ms,fetched_at_ms,raw_values_json,numeric_value,parse_status,mapping_status
    ) VALUES(?,?,?,?,?,?,?,?)`);
    for (const reading of input.readings) {
      insertReading.run(input.pollRunId, reading.sensorId, reading.sensorUpdateAtMs, reading.fetchedAtMs,
        JSON.stringify(reading.rawValues), reading.numericValue ?? null, "VALID", "UNMAPPED");
    }
    db.prepare(`INSERT INTO api_endpoint_runs(
      poll_run_id,endpoint,attempted,attempt_count,completed_at_ms,result
    ) VALUES(?,'values',1,1,?,'SUCCESS')`).run(input.pollRunId, input.finishedAtMs);
    db.prepare(`UPDATE api_poll_runs SET status='SUCCESS', finished_at_ms=?, persisted_reading_count=?
      WHERE poll_run_id=?`).run(input.finishedAtMs, input.readings.length, input.pollRunId);
    return "SUCCESS";
  });
}

export function latestCollectionSuccessMs(db: AppDatabase): number | null {
  const row = db.prepare(`SELECT MAX(finished_at_ms) value FROM api_poll_runs
    WHERE trigger_type IN ('STARTUP','SCHEDULED','MODE_RESUME')
      AND status='SUCCESS' AND persisted_reading_count>0`).get() as { value: number | null };
  return row.value;
}
