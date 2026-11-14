import { createHash } from "node:crypto";
import type { AppDatabase } from "./connection";
import { transaction } from "./connection";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const INITIAL_SCHEMA_SQL = String.raw`
CREATE TABLE machines (
  machine_id TEXT PRIMARY KEY CHECK (machine_id IN ('A1','A2','A3','A4','B1','B2','B3','B4')),
  area TEXT NOT NULL CHECK (area IN ('A','B')),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  display_name TEXT NOT NULL,
  UNIQUE (area, display_order)
) STRICT;

CREATE TABLE app_settings (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  provider_mode TEXT NOT NULL CHECK (provider_mode IN ('LIVE','DEMO')),
  mode_revision INTEGER NOT NULL DEFAULT 0 CHECK (mode_revision >= 0),
  stale_after_seconds INTEGER NOT NULL DEFAULT 420 CHECK (stale_after_seconds > 0),
  live_retention_days INTEGER NOT NULL DEFAULT 3 CHECK (live_retention_days >= 1),
  metadata_refresh_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (metadata_refresh_seconds >= 180),
  updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE sensor_catalog (
  sensor_id TEXT PRIMARY KEY, display_name TEXT, sensor_type TEXT, unit TEXT,
  group_id TEXT, group_alias TEXT, group_sorting_id INTEGER, logical_role TEXT,
  machine_id TEXT REFERENCES machines(machine_id),
  area TEXT CHECK (area IS NULL OR area IN ('A','B')),
  point_number INTEGER CHECK (point_number IS NULL OR point_number > 0),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('MAPPED','UNMAPPED','OUT_OF_SCOPE','CONFLICT')),
  config_hash TEXT, group_hash TEXT, first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL, last_verified_at_ms INTEGER,
  CHECK ((logical_role IS NULL AND mapping_status <> 'MAPPED') OR logical_role IS NOT NULL)
) STRICT;
CREATE INDEX idx_sensor_catalog_role ON sensor_catalog(logical_role, area, point_number);
CREATE INDEX idx_sensor_catalog_machine ON sensor_catalog(machine_id);

CREATE TABLE sensor_metadata_snapshots (
  snapshot_id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('configs','groups')),
  payload_hash TEXT NOT NULL, canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  response_time_text TEXT, response_time_ms INTEGER, fetched_at_ms INTEGER NOT NULL,
  first_seen_at_ms INTEGER NOT NULL, last_seen_at_ms INTEGER NOT NULL,
  UNIQUE (endpoint, payload_hash)
) STRICT;

CREATE TABLE api_poll_runs (
  poll_run_id INTEGER PRIMARY KEY, batch_time_text TEXT NOT NULL, batch_time_ms INTEGER NOT NULL,
  sample_slot_ms INTEGER, scheduled_for_ms INTEGER, started_at_ms INTEGER NOT NULL, finished_at_ms INTEGER,
  provider_mode_at_start TEXT NOT NULL CHECK (provider_mode_at_start IN ('LIVE','DEMO')),
  mode_revision_at_start INTEGER NOT NULL CHECK (mode_revision_at_start >= 0),
  within_service_window INTEGER NOT NULL CHECK (within_service_window IN (0,1)),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('STARTUP','SCHEDULED','MODE_RESUME','MANUAL_TEST')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED','SKIPPED_OUTSIDE_WINDOW','SKIPPED_OVERLAP','DISCARDED_MODE_CHANGED','ABORTED')),
  persisted_reading_count INTEGER NOT NULL DEFAULT 0 CHECK (persisted_reading_count >= 0),
  error_summary TEXT
) STRICT;
CREATE INDEX idx_poll_batch_time ON api_poll_runs(batch_time_ms DESC);
CREATE INDEX idx_poll_sample_slot ON api_poll_runs(sample_slot_ms DESC);
CREATE INDEX idx_poll_status_time ON api_poll_runs(status, started_at_ms DESC);

CREATE TABLE api_endpoint_runs (
  endpoint_run_id INTEGER PRIMARY KEY,
  poll_run_id INTEGER NOT NULL REFERENCES api_poll_runs(poll_run_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('values','configs','groups')),
  attempted INTEGER NOT NULL CHECK (attempted IN (0,1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  http_status INTEGER, api_response_code TEXT, api_response_message TEXT,
  response_time_text TEXT, response_time_ms INTEGER, fetched_at_ms INTEGER,
  completed_at_ms INTEGER, duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  payload_hash TEXT,
  result TEXT NOT NULL CHECK (result IN ('NOT_DUE','SUCCESS','FAILED','SCHEMA_ERROR')),
  error_code TEXT, error_message_safe TEXT,
  UNIQUE (poll_run_id, endpoint)
) STRICT;
CREATE INDEX idx_endpoint_health ON api_endpoint_runs(endpoint, completed_at_ms DESC);

CREATE TABLE live_sensor_readings (
  reading_id INTEGER PRIMARY KEY,
  poll_run_id INTEGER NOT NULL REFERENCES api_poll_runs(poll_run_id) ON DELETE CASCADE,
  sensor_id TEXT NOT NULL, sensor_update_time_text TEXT, sensor_update_at_ms INTEGER,
  fetched_at_ms INTEGER NOT NULL, raw_status INTEGER,
  raw_values_json TEXT NOT NULL CHECK (json_valid(raw_values_json)),
  value_text TEXT, numeric_value REAL, lamp_blue INTEGER, lamp_green INTEGER,
  lamp_red INTEGER, lamp_white INTEGER, lamp_yellow INTEGER,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('VALID','PARTIAL','INVALID','UNKNOWN_TYPE')),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('MAPPED','STALE_MAPPING','UNMAPPED')),
  UNIQUE (poll_run_id, sensor_id)
) STRICT;
CREATE INDEX idx_live_sensor_time ON live_sensor_readings(sensor_id, sensor_update_at_ms DESC);
CREATE INDEX idx_live_fetched ON live_sensor_readings(fetched_at_ms DESC);

CREATE TABLE import_batches (
  batch_id INTEGER PRIMARY KEY, source_date TEXT, original_file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0), file_sha256 TEXT NOT NULL,
  canonical_fingerprint TEXT, contract_version TEXT NOT NULL, dictionary_version TEXT,
  alarm_source_status TEXT NOT NULL CHECK (alarm_source_status IN ('PROVIDED_NONEMPTY','PROVIDED_EMPTY','MISSING','UNKNOWN')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REPLACED','FAILED')),
  replaces_batch_id INTEGER REFERENCES import_batches(batch_id),
  machine_row_count INTEGER NOT NULL DEFAULT 0 CHECK (machine_row_count >= 0),
  environment_row_count INTEGER NOT NULL DEFAULT 0 CHECK (environment_row_count >= 0),
  alarm_row_count INTEGER NOT NULL DEFAULT 0 CHECK (alarm_row_count >= 0),
  quality_issue_row_count INTEGER NOT NULL DEFAULT 0 CHECK (quality_issue_row_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  confirmed_at_ms INTEGER, activated_at_ms INTEGER, replaced_at_ms INTEGER, created_at_ms INTEGER NOT NULL,
  CHECK (status = 'FAILED' OR source_date IS NOT NULL),
  CHECK (status = 'FAILED' OR canonical_fingerprint IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX uq_active_source_date ON import_batches(source_date) WHERE status = 'ACTIVE';
CREATE INDEX idx_batch_fingerprint ON import_batches(canonical_fingerprint);
CREATE INDEX idx_batch_file_sha ON import_batches(file_sha256);
CREATE INDEX idx_batch_source_history ON import_batches(source_date, created_at_ms DESC);

CREATE TABLE import_batch_events (
  event_id INTEGER PRIMARY KEY, source_date TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ACTIVATE','REPLACE','ROLLBACK','IMPORT_FAILED')),
  from_batch_id INTEGER REFERENCES import_batches(batch_id),
  to_batch_id INTEGER REFERENCES import_batches(batch_id), reason TEXT, created_at_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_batch_events_date ON import_batch_events(source_date, created_at_ms DESC);

CREATE TABLE import_metadata_entries (
  metadata_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL CHECK (sheet_name IN ('data_dictionary','README')),
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  item_key TEXT NOT NULL, value_text TEXT, note_text TEXT,
  UNIQUE (batch_id, sheet_name, source_row_number)
) STRICT;
CREATE INDEX idx_metadata_key ON import_metadata_entries(batch_id, sheet_name, item_key);

CREATE TABLE validation_issues (
  issue_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL, quality_rule_version TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ERROR','WARNING','INFO')),
  sheet_name TEXT, source_row_number INTEGER, column_name TEXT, metric_scope TEXT,
  message_safe TEXT NOT NULL, details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_validation_batch_severity ON validation_issues(batch_id, severity, sheet_name, source_row_number);

CREATE TABLE history_machine_intervals (
  machine_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL, time_label TEXT NOT NULL,
  interval_start_text TEXT NOT NULL, interval_end_text TEXT NOT NULL,
  interval_start_ms INTEGER NOT NULL, interval_end_ms INTEGER NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines(machine_id), area TEXT NOT NULL CHECK (area IN ('A','B')),
  none_seconds REAL, red_seconds REAL, yellow_seconds REAL, green_seconds REAL, blue_seconds REAL, white_seconds REAL,
  source_four_state_total_seconds REAL, source_processing_hours REAL, source_yellow_hours REAL,
  source_red_hours REAL, source_none_hours REAL, source_interval_processing_ratio REAL,
  source_powered_processing_ratio REAL, source_quality_status TEXT NOT NULL, source_quality_note TEXT,
  source_exception_json TEXT CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  green_hours_eligible INTEGER NOT NULL CHECK (green_hours_eligible IN (0,1)),
  four_state_ratio_eligible INTEGER NOT NULL CHECK (four_state_ratio_eligible IN (0,1)),
  six_state_share_eligible INTEGER NOT NULL CHECK (six_state_share_eligible IN (0,1)),
  transition_eligible INTEGER NOT NULL CHECK (transition_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL, issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  CHECK (interval_end_ms - interval_start_ms = 180000),
  CHECK (area = substr(machine_id, 1, 1)),
  UNIQUE (batch_id, machine_id, source_date, time_label)
) STRICT;
CREATE INDEX idx_machine_query ON history_machine_intervals(machine_id, interval_start_ms);
CREATE INDEX idx_machine_batch_time ON history_machine_intervals(batch_id, interval_start_ms);
CREATE INDEX idx_machine_source_date ON history_machine_intervals(source_date, machine_id, time_label);

CREATE TABLE history_environment_intervals (
  environment_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL, time_label TEXT NOT NULL,
  interval_start_text TEXT NOT NULL, interval_end_text TEXT NOT NULL,
  interval_start_ms INTEGER NOT NULL, interval_end_ms INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('A','B')),
  sensor_number INTEGER NOT NULL CHECK (sensor_number > 0), category TEXT NOT NULL,
  average_value REAL, maximum_value REAL, median_value REAL, minimum_value REAL,
  reference_threshold REAL, source_max_judgement TEXT, source_quality_status TEXT NOT NULL, source_note TEXT,
  source_exception_json TEXT CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  average_eligible INTEGER NOT NULL CHECK (average_eligible IN (0,1)),
  maximum_eligible INTEGER NOT NULL CHECK (maximum_eligible IN (0,1)),
  median_eligible INTEGER NOT NULL CHECK (median_eligible IN (0,1)),
  minimum_eligible INTEGER NOT NULL CHECK (minimum_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL, issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  CHECK (interval_end_ms - interval_start_ms = 180000),
  UNIQUE (batch_id, area, sensor_number, category, source_date, time_label)
) STRICT;
CREATE INDEX idx_environment_query ON history_environment_intervals(area, sensor_number, category, interval_start_ms);
CREATE INDEX idx_environment_batch_time ON history_environment_intervals(batch_id, interval_start_ms);

CREATE TABLE history_alarm_events (
  alarm_event_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2), source_date TEXT NOT NULL,
  event_time_text TEXT NOT NULL, event_at_ms INTEGER NOT NULL, sensor_name TEXT NOT NULL,
  sensor_id TEXT NOT NULL, sensor_type TEXT NOT NULL, group_text TEXT,
  rule_name TEXT NOT NULL, rule_condition_text TEXT NOT NULL, current_value_text TEXT,
  current_value_numeric REAL, duration_original TEXT, initial_classification TEXT, classification_status TEXT,
  event_fingerprint TEXT NOT NULL,
  duplicate_within_batch INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_within_batch IN (0,1)),
  issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  UNIQUE (batch_id, source_row_number)
) STRICT;
CREATE INDEX idx_alarm_time ON history_alarm_events(event_at_ms, sensor_id);
CREATE INDEX idx_alarm_type_rule ON history_alarm_events(sensor_type, rule_name, event_at_ms);
CREATE INDEX idx_alarm_fingerprint ON history_alarm_events(batch_id, event_fingerprint);

CREATE TABLE history_quality_issues (
  quality_issue_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL, time_label TEXT, subject_text TEXT NOT NULL, problem_text TEXT NOT NULL,
  interval_total_seconds REAL,
  source_exception_json TEXT CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  UNIQUE (batch_id, source_row_number)
) STRICT;
CREATE INDEX idx_quality_issue_date ON history_quality_issues(source_date, subject_text);

INSERT INTO machines(machine_id, area, display_order, display_name) VALUES
 ('A1','A',1,'A1'),('A2','A',2,'A2'),('A3','A',3,'A3'),('A4','A',4,'A4'),
 ('B1','B',1,'B1'),('B2','B',2,'B2'),('B3','B',3,'B3'),('B4','B',4,'B4');
INSERT INTO app_settings(singleton_id, provider_mode, mode_revision, updated_at_ms)
VALUES (1, 'DEMO', 0, 0);
`;

export const STAGE5_2_NULLABILITY_SQL = String.raw`
CREATE TABLE stage52_severe_machine_rows (
  batch_id INTEGER NOT NULL,
  source_row_number INTEGER NOT NULL,
  PRIMARY KEY(batch_id, source_row_number)
) STRICT;

INSERT INTO stage52_severe_machine_rows(batch_id,source_row_number)
SELECT m.batch_id,m.source_row_number
FROM history_machine_intervals m
WHERE (
  (
    (m.source_quality_note LIKE '%六態%' OR m.source_quality_note LIKE '%秒數%' OR m.source_quality_note LIKE '%區間合計%')
    AND (m.source_quality_note LIKE '%嚴重%' OR m.source_quality_note LIKE '%極度%' OR m.source_quality_note LIKE '%極少%')
  ) OR EXISTS (
    SELECT 1 FROM history_quality_issues q
    WHERE q.batch_id=m.batch_id AND q.source_date=m.source_date AND q.time_label=m.time_label
      AND instr(q.subject_text,m.machine_id)>0
      AND (q.problem_text LIKE '%六態%' OR q.problem_text LIKE '%秒數%' OR q.problem_text LIKE '%區間合計%')
      AND (q.problem_text LIKE '%嚴重%' OR q.problem_text LIKE '%極度%' OR q.problem_text LIKE '%極少%')
  )
);

ALTER TABLE history_machine_intervals RENAME TO history_machine_intervals_v1;
CREATE TABLE history_machine_intervals (
  machine_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL, time_label TEXT NOT NULL,
  interval_start_text TEXT NOT NULL, interval_end_text TEXT NOT NULL,
  interval_start_ms INTEGER NOT NULL, interval_end_ms INTEGER NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines(machine_id), area TEXT NOT NULL CHECK (area IN ('A','B')),
  none_seconds REAL, red_seconds REAL, yellow_seconds REAL, green_seconds REAL, blue_seconds REAL, white_seconds REAL,
  source_four_state_total_seconds REAL, source_processing_hours REAL, source_yellow_hours REAL,
  source_red_hours REAL, source_none_hours REAL, source_interval_processing_ratio REAL,
  source_powered_processing_ratio REAL, source_quality_status TEXT, source_quality_note TEXT,
  source_exception_json TEXT CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  green_hours_eligible INTEGER NOT NULL CHECK (green_hours_eligible IN (0,1)),
  four_state_ratio_eligible INTEGER NOT NULL CHECK (four_state_ratio_eligible IN (0,1)),
  six_state_share_eligible INTEGER NOT NULL CHECK (six_state_share_eligible IN (0,1)),
  transition_eligible INTEGER NOT NULL CHECK (transition_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL, issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  CHECK (interval_end_ms - interval_start_ms = 180000),
  CHECK (area = substr(machine_id, 1, 1)),
  UNIQUE (batch_id, machine_id, source_date, time_label)
) STRICT;
INSERT INTO history_machine_intervals(
  machine_interval_id,batch_id,source_row_number,source_date,time_label,interval_start_text,interval_end_text,
  interval_start_ms,interval_end_ms,machine_id,area,none_seconds,red_seconds,yellow_seconds,green_seconds,blue_seconds,white_seconds,
  source_four_state_total_seconds,source_processing_hours,source_yellow_hours,source_red_hours,source_none_hours,
  source_interval_processing_ratio,source_powered_processing_ratio,source_quality_status,source_quality_note,source_exception_json,
  green_hours_eligible,four_state_ratio_eligible,six_state_share_eligible,transition_eligible,quality_rule_version,issue_codes_json
)
SELECT
  m.machine_interval_id,m.batch_id,m.source_row_number,m.source_date,m.time_label,m.interval_start_text,m.interval_end_text,
  m.interval_start_ms,m.interval_end_ms,m.machine_id,m.area,m.none_seconds,m.red_seconds,m.yellow_seconds,m.green_seconds,m.blue_seconds,m.white_seconds,
  m.source_four_state_total_seconds,m.source_processing_hours,m.source_yellow_hours,m.source_red_hours,m.source_none_hours,
  m.source_interval_processing_ratio,m.source_powered_processing_ratio,NULLIF(m.source_quality_status,''),m.source_quality_note,m.source_exception_json,
  CASE WHEN s.batch_id IS NULL THEN m.green_hours_eligible ELSE 0 END,
  m.four_state_ratio_eligible,
  CASE WHEN s.batch_id IS NULL THEN m.six_state_share_eligible ELSE 0 END,
  CASE WHEN s.batch_id IS NULL THEN m.transition_eligible ELSE 0 END,
  'jiyin-quality-v2',
  CASE WHEN s.batch_id IS NULL THEN m.issue_codes_json ELSE json_insert(m.issue_codes_json,'$[#]','STATE_SEVERE_INCOMPLETE') END
FROM history_machine_intervals_v1 m
LEFT JOIN stage52_severe_machine_rows s ON s.batch_id=m.batch_id AND s.source_row_number=m.source_row_number;
DROP TABLE history_machine_intervals_v1;
CREATE INDEX idx_machine_query ON history_machine_intervals(machine_id, interval_start_ms);
CREATE INDEX idx_machine_batch_time ON history_machine_intervals(batch_id, interval_start_ms);
CREATE INDEX idx_machine_source_date ON history_machine_intervals(source_date, machine_id, time_label);

ALTER TABLE history_environment_intervals RENAME TO history_environment_intervals_v1;
CREATE TABLE history_environment_intervals (
  environment_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL, time_label TEXT NOT NULL,
  interval_start_text TEXT NOT NULL, interval_end_text TEXT NOT NULL,
  interval_start_ms INTEGER NOT NULL, interval_end_ms INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('A','B')),
  sensor_number INTEGER NOT NULL CHECK (sensor_number > 0), category TEXT NOT NULL,
  average_value REAL, maximum_value REAL, median_value REAL, minimum_value REAL,
  reference_threshold REAL, source_max_judgement TEXT, source_quality_status TEXT, source_note TEXT,
  source_exception_json TEXT CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  average_eligible INTEGER NOT NULL CHECK (average_eligible IN (0,1)),
  maximum_eligible INTEGER NOT NULL CHECK (maximum_eligible IN (0,1)),
  median_eligible INTEGER NOT NULL CHECK (median_eligible IN (0,1)),
  minimum_eligible INTEGER NOT NULL CHECK (minimum_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL, issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  CHECK (interval_end_ms - interval_start_ms = 180000),
  UNIQUE (batch_id, area, sensor_number, category, source_date, time_label)
) STRICT;
INSERT INTO history_environment_intervals(
  environment_interval_id,batch_id,source_row_number,source_date,time_label,interval_start_text,interval_end_text,
  interval_start_ms,interval_end_ms,area,sensor_number,category,average_value,maximum_value,median_value,minimum_value,
  reference_threshold,source_max_judgement,source_quality_status,source_note,source_exception_json,average_eligible,
  maximum_eligible,median_eligible,minimum_eligible,quality_rule_version,issue_codes_json
)
SELECT environment_interval_id,batch_id,source_row_number,source_date,time_label,interval_start_text,interval_end_text,
  interval_start_ms,interval_end_ms,area,sensor_number,category,average_value,maximum_value,median_value,minimum_value,
  reference_threshold,source_max_judgement,NULLIF(source_quality_status,''),source_note,source_exception_json,average_eligible,
  maximum_eligible,median_eligible,minimum_eligible,'jiyin-quality-v2',issue_codes_json
FROM history_environment_intervals_v1;
DROP TABLE history_environment_intervals_v1;
CREATE INDEX idx_environment_query ON history_environment_intervals(area, sensor_number, category, interval_start_ms);
CREATE INDEX idx_environment_batch_time ON history_environment_intervals(batch_id, interval_start_ms);

ALTER TABLE history_alarm_events RENAME TO history_alarm_events_v1;
CREATE TABLE history_alarm_events (
  alarm_event_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2), source_date TEXT NOT NULL,
  event_time_text TEXT NOT NULL, event_at_ms INTEGER NOT NULL,
  sensor_name TEXT, sensor_id TEXT NOT NULL, sensor_type TEXT, group_text TEXT,
  rule_name TEXT, rule_condition_text TEXT, current_value_text TEXT, current_value_numeric REAL,
  duration_original TEXT, initial_classification TEXT, classification_status TEXT,
  event_fingerprint TEXT NOT NULL,
  duplicate_within_batch INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_within_batch IN (0,1)),
  issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  UNIQUE (batch_id, source_row_number)
) STRICT;
INSERT INTO history_alarm_events(
  alarm_event_id,batch_id,source_row_number,source_date,event_time_text,event_at_ms,sensor_name,sensor_id,sensor_type,
  group_text,rule_name,rule_condition_text,current_value_text,current_value_numeric,duration_original,
  initial_classification,classification_status,event_fingerprint,duplicate_within_batch,issue_codes_json
)
SELECT alarm_event_id,batch_id,source_row_number,source_date,event_time_text,event_at_ms,NULLIF(sensor_name,''),sensor_id,
  NULLIF(sensor_type,''),group_text,NULLIF(rule_name,''),NULLIF(rule_condition_text,''),current_value_text,current_value_numeric,
  duration_original,initial_classification,classification_status,event_fingerprint,duplicate_within_batch,issue_codes_json
FROM history_alarm_events_v1;
DROP TABLE history_alarm_events_v1;
CREATE INDEX idx_alarm_time ON history_alarm_events(event_at_ms, sensor_id);
CREATE INDEX idx_alarm_type_rule ON history_alarm_events(sensor_type, rule_name, event_at_ms);
CREATE INDEX idx_alarm_fingerprint ON history_alarm_events(batch_id, event_fingerprint);

ALTER TABLE validation_issues RENAME TO validation_issues_v1;
CREATE TABLE validation_issues (
  issue_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL, quality_rule_version TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ERROR','SEVERE','WARNING','INFO')),
  sheet_name TEXT, source_row_number INTEGER, column_name TEXT, metric_scope TEXT,
  message_safe TEXT NOT NULL, details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at_ms INTEGER NOT NULL
) STRICT;
INSERT INTO validation_issues(issue_id,batch_id,rule_code,quality_rule_version,severity,sheet_name,source_row_number,column_name,metric_scope,message_safe,details_json,created_at_ms)
SELECT issue_id,batch_id,rule_code,'jiyin-quality-v2',severity,sheet_name,source_row_number,column_name,metric_scope,message_safe,details_json,created_at_ms
FROM validation_issues_v1;
DROP TABLE validation_issues_v1;
CREATE INDEX idx_validation_batch_severity ON validation_issues(batch_id, severity, sheet_name, source_row_number);
INSERT INTO validation_issues(batch_id,rule_code,quality_rule_version,severity,sheet_name,source_row_number,metric_scope,message_safe,created_at_ms)
SELECT s.batch_id,'STATE_SEVERE_INCOMPLETE','jiyin-quality-v2','SEVERE','machine_3min',s.source_row_number,
  'GREEN_HOURS,SIX_STATE_SHARE,TRANSITION','來源已標示三分鐘秒數嚴重不完整；保留原值但排除相關統計',
  COALESCE((SELECT confirmed_at_ms FROM import_batches WHERE batch_id=s.batch_id),0)
FROM stage52_severe_machine_rows s;

UPDATE import_batches
SET warning_count=(SELECT COUNT(*) FROM validation_issues v WHERE v.batch_id=import_batches.batch_id AND v.severity<>'ERROR'),
    error_count=(SELECT COUNT(*) FROM validation_issues v WHERE v.batch_id=import_batches.batch_id AND v.severity='ERROR');
DROP TABLE stage52_severe_machine_rows;
`;

export const migrations: Migration[] = [
  { version: 1, name: "initial_schema", sql: INITIAL_SCHEMA_SQL },
  { version: 2, name: "stage5_2_nullable_quality_v2", sql: STAGE5_2_NULLABILITY_SQL },
];

function checksum(sql: string) {
  return createHash("sha256").update(sql).digest("hex");
}

export function applyMigrations(db: AppDatabase, set: Migration[] = migrations): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at_ms INTEGER NOT NULL
  ) STRICT`);
  const find = db.prepare("SELECT name, checksum FROM schema_migrations WHERE version = ?");
  const record = db.prepare("INSERT INTO schema_migrations(version,name,checksum,applied_at_ms) VALUES(?,?,?,?)");
  for (const migration of [...set].sort((a, b) => a.version - b.version)) {
    const hash = checksum(migration.sql);
    const existing = find.get(migration.version) as { name: string; checksum: string } | undefined;
    if (existing) {
      if (existing.name !== migration.name || existing.checksum !== hash) throw new Error(`Migration ${migration.version} checksum mismatch`);
      continue;
    }
    transaction(db, () => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, hash, Date.now());
    });
  }
}

export function currentSchemaVersion(db: AppDatabase): number {
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) version FROM schema_migrations").get() as { version: number };
  return row.version;
}
