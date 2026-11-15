import type { AppDatabase } from "@/server/db/connection";
import {
  getActiveAlarmEvents,
  getActiveBatchCoverage,
  getActiveMachineIntervalsBySourceDate,
} from "@/server/db/history-repository";
import { CURRENT_QUALITY_RULE_VERSION } from "@/server/import/workbook-parser";
import {
  bucketGreenSeconds,
  calculateGreenHours,
  calculateSixStateShare,
  calculateStateHours,
  calculateThreeStateShare,
  expectedIntervals,
  groupContinuousStateRuns,
  type Availability,
  type OperationState,
  type StatisticInterval,
} from "./history-statistics";

const DAY_MS = 86_400_000;
const MACHINE_IDS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"] as const;

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("DATE_INVALID");
  const epoch = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) throw new Error("DATE_INVALID");
  return epoch;
}

function dateAt(epoch: number) {
  return new Date(epoch).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return dateAt(parseDate(value) + days * DAY_MS);
}

function daysInclusive(start: string, end: string) {
  const days = (parseDate(end) - parseDate(start)) / DAY_MS + 1;
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("DATE_RANGE_INVALID");
  return days;
}

function machines(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.some((id) => !MACHINE_IDS.includes(id as (typeof MACHINE_IDS)[number]))) {
    throw new Error("MACHINE_IDS_INVALID");
  }
  return unique;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function parseIssueCodes(value: unknown) {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function statisticRow(row: Record<string, unknown>): StatisticInterval {
  return {
    machineId: String(row.machine_id),
    sourceDate: String(row.source_date),
    timeLabel: String(row.time_label),
    intervalStartMs: Number(row.interval_start_ms),
    intervalEndMs: Number(row.interval_end_ms),
    noneSeconds: nullableNumber(row.none_seconds),
    redSeconds: nullableNumber(row.red_seconds),
    yellowSeconds: nullableNumber(row.yellow_seconds),
    greenSeconds: nullableNumber(row.green_seconds),
    blueSeconds: nullableNumber(row.blue_seconds),
    whiteSeconds: nullableNumber(row.white_seconds),
    greenHoursEligible: Boolean(row.green_hours_eligible),
    sixStateShareEligible: Boolean(row.six_state_share_eligible),
    transitionEligible: Boolean(row.transition_eligible),
    qualityRuleVersion: String(row.quality_rule_version),
    issueCodes: parseIssueCodes(row.issue_codes_json),
  };
}

function activeRows(db: AppDatabase, machineIds: string[], startDate: string, endDate: string) {
  return getActiveMachineIntervalsBySourceDate(db, machineIds, startDate, endDate).map(statisticRow);
}

function activeDates(db: AppDatabase, startDate: string, endDate: string) {
  return getActiveBatchCoverage(db, startDate, endDate);
}

function coverage(db: AppDatabase, rows: StatisticInterval[], startDate: string, endDate: string, machineCount: number) {
  const requestedDays = daysInclusive(startDate, endDate);
  const expected = expectedIntervals(requestedDays, machineCount);
  const green = calculateGreenHours(rows, CURRENT_QUALITY_RULE_VERSION, expected);
  const six = calculateSixStateShare(rows, CURRENT_QUALITY_RULE_VERSION, expected);
  const three = calculateThreeStateShare(rows, CURRENT_QUALITY_RULE_VERSION, expected);
  return {
    requestedDays,
    daysWithActiveBatch: activeDates(db, startDate, endDate).length,
    expectedIntervals: expected,
    importedIntervals: rows.length,
    greenEligibleIntervals: green.coverage.metricEligibleIntervals,
    sixStateEligibleIntervals: six.coverage.metricEligibleIntervals,
    threeStateEligibleIntervals: three.coverage.metricEligibleIntervals,
    excludedByRule: {
      ...green.coverage.excludedByReason,
      ...six.coverage.excludedByReason,
      ...three.coverage.excludedByReason,
    },
  };
}

function sixStateShare(rows: StatisticInterval[]) {
  const result = calculateSixStateShare(rows, CURRENT_QUALITY_RULE_VERSION, 0);
  return {
    seconds: result.seconds,
    percent: result.shares,
    denominatorSeconds: result.denominatorSeconds,
    availability: result.coverage.metricEligibleIntervals ? "AVAILABLE" as const : "MISSING_DATA" as const,
  };
}

function threeStateShare(rows: StatisticInterval[]) {
  const result = calculateThreeStateShare(rows, CURRENT_QUALITY_RULE_VERSION, 0);
  return {
    seconds: result.seconds,
    percent: result.shares,
    denominatorSeconds: result.denominatorSeconds,
    availability: result.coverage.metricEligibleIntervals && result.denominatorSeconds > 0
      ? "AVAILABLE" as const
      : "MISSING_DATA" as const,
    importedIntervals: result.coverage.importedIntervals,
    eligibleIntervals: result.coverage.metricEligibleIntervals,
    excludedByReason: result.coverage.excludedByReason,
  };
}

function percentOf(value: number | null, total: number | null) {
  return value === null || total === null || total <= 0 ? null : value / total;
}

function ranking(rows: StatisticInterval[], machineIds: string[]) {
  const selected = calculateGreenHours(rows, CURRENT_QUALITY_RULE_VERSION, 0);
  return machineIds.map((machineId) => {
    const result = calculateGreenHours(rows.filter((row) => row.machineId === machineId), CURRENT_QUALITY_RULE_VERSION, 0);
    return {
      machineId,
      greenHours: result.hours,
      hasData: result.availability === "AVAILABLE",
      availability: result.availability,
      eligibleIntervals: result.coverage.metricEligibleIntervals,
      selectedGreenShare: percentOf(result.hours, selected.hours),
    };
  }).sort((a, b) => (b.greenHours ?? -1) - (a.greenHours ?? -1) || a.machineId.localeCompare(b.machineId));
}

function clock(minute: number) {
  return minute === 1440
    ? "24:00"
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function bucketLabel(index: number, bucket: 30 | 60) {
  return `${clock(index * bucket)}-${clock((index + 1) * bucket)}`;
}

function completeness(imported: number, eligible: number, expected: number) {
  if (imported === 0) return "MISSING" as const;
  return imported >= expected && eligible >= expected ? "COMPLETE" as const : "PARTIAL" as const;
}

function pointCoverage(importedIntervals: number, eligibleIntervals: number, expected: number) {
  return {
    expectedIntervals: expected,
    importedIntervals,
    eligibleIntervals,
    completeness: completeness(importedIntervals, eligibleIntervals, expected),
  };
}

export interface ProcessingRangeInput {
  startDate: string;
  endDate: string;
  bucketMinutes: 30 | 60;
  machineIds: string[];
}

function rangeTrend(
  rows: StatisticInterval[],
  startDate: string,
  requestedDays: number,
  bucketMinutes: 30 | 60,
  machineCount: number,
) {
  const grain = requestedDays === 1 ? bucketMinutes : "DAY" as const;
  const buckets = bucketGreenSeconds(rows, grain, CURRENT_QUALITY_RULE_VERSION);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const expectedPerPoint = requestedDays === 1 ? (bucketMinutes / 3) * machineCount : 480 * machineCount;
  return requestedDays === 1
    ? Array.from({ length: 1440 / bucketMinutes }, (_, index) => {
        const minute = index * bucketMinutes;
        const key = `${startDate} ${clock(minute)}`;
        const bucket = byKey.get(key);
        const position = bucketLabel(index, bucketMinutes);
        const imported = bucket?.importedIntervals ?? 0;
        const eligible = bucket?.eligibleIntervals ?? 0;
        return {
          position,
          sourceLabel: `${startDate} ${position}`,
          greenHours: bucket?.greenHours ?? null,
          availability: bucket?.availability ?? "MISSING_DATA" as Availability,
          importedIntervals: imported,
          eligibleIntervals: eligible,
          coverage: pointCoverage(imported, eligible, expectedPerPoint),
        };
      })
    : Array.from({ length: requestedDays }, (_, index) => {
        const sourceDate = addDays(startDate, index);
        const bucket = byKey.get(sourceDate);
        const imported = bucket?.importedIntervals ?? 0;
        const eligible = bucket?.eligibleIntervals ?? 0;
        return {
          position: sourceDate,
          sourceLabel: sourceDate,
          greenHours: bucket?.greenHours ?? null,
          availability: bucket?.availability ?? "MISSING_DATA" as Availability,
          importedIntervals: imported,
          eligibleIntervals: eligible,
          coverage: pointCoverage(imported, eligible, expectedPerPoint),
        };
      });
}

export function getProcessingRange(db: AppDatabase, input: ProcessingRangeInput) {
  const machineIds = machines(input.machineIds);
  const requestedDays = daysInclusive(input.startDate, input.endDate);
  const rows = activeRows(db, machineIds, input.startDate, input.endDate);
  const trend = rangeTrend(rows, input.startDate, requestedDays, input.bucketMinutes, machineIds.length);
  const seriesByMachine = machineIds.map((machineId) => ({
    machineId,
    points: rangeTrend(
      rows.filter((row) => row.machineId === machineId),
      input.startDate,
      requestedDays,
      input.bucketMinutes,
      1,
    ),
  }));
  const stateShareByMachine = machineIds.map((machineId) => ({
    machineId,
    share: sixStateShare(rows.filter((row) => row.machineId === machineId)),
  }));
  const threeStateShareByMachine = machineIds.map((machineId) => ({
    machineId,
    share: threeStateShare(rows.filter((row) => row.machineId === machineId)),
  }));
  return {
    mode: "range" as const,
    period: {
      startDate: input.startDate,
      endDate: input.endDate,
      days: requestedDays,
      grain: requestedDays === 1 ? `${input.bucketMinutes}_MINUTES` : "DAY",
    },
    ranking: ranking(rows, machineIds),
    trend,
    seriesByMachine,
    stateShare: sixStateShare(rows),
    stateShareByMachine,
    threeStateShare: threeStateShare(rows),
    threeStateShareByMachine,
    coverage: coverage(db, rows, input.startDate, input.endDate, machineIds.length),
  };
}

export type CompareKind = "day" | "week" | "month";

export interface ProcessingComparisonInput {
  compareKind: CompareKind;
  periodA: string;
  periodB: string;
  machineIds: string[];
  bucketMinutes?: 30 | 60;
  nowMs?: number;
}

interface Period {
  label: string;
  startDate: string;
  endDate: string;
  days: number;
  positions: number;
  partial: boolean;
  elapsedCalendarDays: number;
}

function period(kind: CompareKind, value: string, nowMs: number): Period {
  if (kind === "day") {
    parseDate(value);
    return { label: value, startDate: value, endDate: value, days: 1, positions: 24, partial: false, elapsedCalendarDays: 1 };
  }
  if (kind === "week") {
    parseDate(value);
    return { label: value, startDate: value, endDate: addDays(value, 6), days: 7, positions: 7, partial: false, elapsedCalendarDays: 7 };
  }
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error("PERIOD_INVALID");
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("PERIOD_INVALID");
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const now = new Date(nowMs);
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const requestedMonth = year * 12 + month - 1;
  const partial = requestedMonth >= nowMonth;
  const elapsedCalendarDays = requestedMonth < nowMonth ? days : requestedMonth > nowMonth ? 0 : Math.min(now.getUTCDate(), days);
  return {
    label: value,
    startDate: `${value}-01`,
    endDate: `${value}-${String(days).padStart(2, "0")}`,
    days,
    positions: 31,
    partial,
    elapsedCalendarDays,
  };
}

interface TrendPeriodPoint {
  sourceDate: string;
  greenHours: number | null;
  availability: Availability;
  coverage: ReturnType<typeof pointCoverage>;
}

function trendMap(rows: StatisticInterval[], kind: CompareKind, periodValue: Period, machineCount: number) {
  const result = new Map<number, TrendPeriodPoint>();
  if (kind === "day") {
    const buckets = bucketGreenSeconds(rows, 60, CURRENT_QUALITY_RULE_VERSION);
    const byKey = new Map(buckets.map((item) => [item.key, item]));
    for (let index = 0; index < periodValue.positions; index += 1) {
      const key = `${periodValue.startDate} ${clock(index * 60)}`;
      const item = byKey.get(key);
      const imported = item?.importedIntervals ?? 0;
      const eligible = item?.eligibleIntervals ?? 0;
      result.set(index + 1, {
        sourceDate: periodValue.startDate,
        greenHours: item?.greenHours ?? null,
        availability: item?.availability ?? "MISSING_DATA",
        coverage: pointCoverage(imported, eligible, 20 * machineCount),
      });
    }
    return result;
  }

  const buckets = new Map(bucketGreenSeconds(rows, "DAY", CURRENT_QUALITY_RULE_VERSION).map((item) => [item.key, item]));
  for (let index = 0; index < periodValue.positions; index += 1) {
    if (index >= periodValue.days) {
      result.set(index + 1, {
        sourceDate: "",
        greenHours: null,
        availability: "NOT_APPLICABLE",
        coverage: pointCoverage(0, 0, 0),
      });
      continue;
    }
    const sourceDate = addDays(periodValue.startDate, index);
    const item = buckets.get(sourceDate);
    const imported = item?.importedIntervals ?? 0;
    const eligible = item?.eligibleIntervals ?? 0;
    result.set(index + 1, {
      sourceDate,
      greenHours: item?.greenHours ?? null,
      availability: item?.availability ?? "MISSING_DATA",
      coverage: pointCoverage(imported, eligible, 480 * machineCount),
    });
  }
  return result;
}

function rankingPeriod(rows: StatisticInterval[], machineId: string, kind: CompareKind, days: number) {
  const result = calculateGreenHours(
    rows.filter((row) => row.machineId === machineId),
    CURRENT_QUALITY_RULE_VERSION,
    0,
  );
  const totalGreenHours = result.hours;
  const value = kind === "month" && totalGreenHours !== null ? totalGreenHours / days : totalGreenHours;
  return {
    greenHours: value,
    totalGreenHours,
    unit: kind === "month" ? "HOURS_PER_DAY" as const : "HOURS" as const,
    availability: result.availability,
    eligibleIntervals: result.coverage.metricEligibleIntervals,
  };
}

function relativeChange(a: number | null, b: number | null) {
  return a === null || b === null || a === 0 ? null : (b - a) / a;
}

function shareDeltas(a: ReturnType<typeof threeStateShare>, b: ReturnType<typeof threeStateShare>) {
  return Object.fromEntries((["green", "yellow", "red"] satisfies OperationState[]).map((state) => [
    state,
    a.percent[state] === null || b.percent[state] === null ? null : (b.percent[state] - a.percent[state]) * 100,
  ])) as Record<OperationState, number | null>;
}

function comparisonSeries(
  rowsA: StatisticInterval[],
  rowsB: StatisticInterval[],
  kind: CompareKind,
  a: Period,
  b: Period,
  machineCount: number,
) {
  const trendA = trendMap(rowsA, kind, a, machineCount);
  const trendB = trendMap(rowsB, kind, b, machineCount);
  const positions = Math.max(a.positions, b.positions);
  return Array.from({ length: positions }, (_, index) => {
    const numericPosition = index + 1;
    const pa = trendA.get(numericPosition)!;
    const pb = trendB.get(numericPosition)!;
    return {
      position: kind === "day" ? bucketLabel(index, 60) : numericPosition,
      periods: {
        A: { sourceDate: pa.sourceDate || null, greenHours: pa.greenHours, availability: pa.availability, coverage: pa.coverage },
        B: { sourceDate: pb.sourceDate || null, greenHours: pb.greenHours, availability: pb.availability, coverage: pb.coverage },
      },
    };
  });
}

export function getProcessingComparison(db: AppDatabase, input: ProcessingComparisonInput) {
  const machineIds = machines(input.machineIds);
  const nowMs = input.nowMs ?? Date.now();
  const a = period(input.compareKind, input.periodA, nowMs);
  const b = period(input.compareKind, input.periodB, nowMs);
  const rowsA = activeRows(db, machineIds, a.startDate, a.endDate);
  const rowsB = activeRows(db, machineIds, b.startDate, b.endDate);
  const rankingResult = machineIds.map((machineId) => {
    const periodA = rankingPeriod(rowsA, machineId, input.compareKind, a.days);
    const periodB = rankingPeriod(rowsB, machineId, input.compareKind, b.days);
    return {
      machineId,
      periods: { A: periodA, B: periodB },
      difference: periodA.greenHours === null || periodB.greenHours === null ? null : periodB.greenHours - periodA.greenHours,
      relativeChange: relativeChange(periodA.greenHours, periodB.greenHours),
    };
  }).sort((left, right) => (
    (right.periods.B.greenHours ?? -1) - (left.periods.B.greenHours ?? -1)
    || left.machineId.localeCompare(right.machineId)
  ));
  const overallA = threeStateShare(rowsA);
  const overallB = threeStateShare(rowsB);
  const threeStateShareByMachine = machineIds.map((machineId) => {
    const shareA = threeStateShare(rowsA.filter((row) => row.machineId === machineId));
    const shareB = threeStateShare(rowsB.filter((row) => row.machineId === machineId));
    return {
      machineId,
      periods: { A: shareA, B: shareB },
      deltaPercentagePoints: shareDeltas(shareA, shareB),
    };
  }).sort((left, right) => (
    (right.periods.B.percent.green ?? -1) - (left.periods.B.percent.green ?? -1)
    || left.machineId.localeCompare(right.machineId)
  ));
  return {
    mode: "compare" as const,
    compareKind: input.compareKind,
    periods: { A: a, B: b },
    ranking: rankingResult,
    trend: comparisonSeries(rowsA, rowsB, input.compareKind, a, b, machineIds.length),
    seriesByMachine: machineIds.map((machineId) => ({
      machineId,
      trend: comparisonSeries(
        rowsA.filter((row) => row.machineId === machineId),
        rowsB.filter((row) => row.machineId === machineId),
        input.compareKind,
        a,
        b,
        1,
      ),
    })),
    stateShare: { periods: { A: sixStateShare(rowsA), B: sixStateShare(rowsB) } },
    threeStateShare: {
      periods: { A: overallA, B: overallB },
      deltaPercentagePoints: shareDeltas(overallA, overallB),
    },
    threeStateShareByMachine,
    coverage: {
      A: coverage(db, rowsA, a.startDate, a.endDate, machineIds.length),
      B: coverage(db, rowsB, b.startDate, b.endDate, machineIds.length),
    },
  };
}

export interface HistoryEventsInput {
  startDate: string;
  endDate: string;
  machineIds: string[];
  sensorIds?: string[];
  sensorType?: string;
  ruleName?: string;
  page: number;
  pageSize: number;
}

export function getHistoryEvents(db: AppDatabase, input: HistoryEventsInput) {
  const machineIds = machines(input.machineIds);
  const requestedDays = daysInclusive(input.startDate, input.endDate);
  const rows = activeRows(db, machineIds, input.startDate, input.endDate);
  const red = calculateStateHours(rows, "red", CURRENT_QUALITY_RULE_VERSION);
  const yellow = calculateStateHours(rows, "yellow", CURRENT_QUALITY_RULE_VERSION);
  const batchRows = activeDates(db, input.startDate, input.endDate);
  const batchByDate = new Map(batchRows.map((row) => [row.source_date, row]));
  const alarmCoverage = Array.from({ length: requestedDays }, (_, index) => {
    const sourceDate = addDays(input.startDate, index);
    const batch = batchByDate.get(sourceDate);
    if (!batch) return { sourceDate, sourceStatus: "MISSING" as const, rowCount: null };
    const readable = batch.alarm_source_status === "PROVIDED_NONEMPTY" || batch.alarm_source_status === "PROVIDED_EMPTY";
    return { sourceDate, sourceStatus: batch.alarm_source_status, rowCount: readable ? batch.alarm_row_count : null };
  });
  const alarms = getActiveAlarmEvents(db, {
    startDate: input.startDate,
    endDate: input.endDate,
    sensorIds: input.sensorIds,
    sensorType: input.sensorType,
    ruleName: input.ruleName,
    page: input.page,
    pageSize: input.pageSize,
  });
  const items = alarms.rows.map((row) => ({
    kind: "ENVIRONMENT_ALARM" as const,
    alarmEventId: Number(row.alarm_event_id),
    sourceRowNumber: Number(row.source_row_number),
    eventAtMs: Number(row.event_at_ms),
    eventTimeText: String(row.event_time_text),
    sensorId: String(row.sensor_id),
    sensorName: nullableText(row.sensor_name),
    sensorType: nullableText(row.sensor_type),
    ruleName: nullableText(row.rule_name),
    ruleCondition: nullableText(row.rule_condition_text),
    currentValue: nullableNumber(row.current_value_numeric),
    currentValueText: nullableText(row.current_value_text),
    durationOriginal: nullableText(row.duration_original),
    classification: nullableText(row.initial_classification),
    classificationStatus: nullableText(row.classification_status),
  }));
  return {
    statusHours: { red: red.hours, yellow: yellow.hours },
    affectedMachines: {
      red: [...new Set(rows.filter((row) => (row.redSeconds ?? 0) > 0).map((row) => row.machineId))],
      yellow: [...new Set(rows.filter((row) => (row.yellowSeconds ?? 0) > 0).map((row) => row.machineId))],
    },
    statusGroups: {
      red: groupContinuousStateRuns(rows, "red", CURRENT_QUALITY_RULE_VERSION),
      yellow: groupContinuousStateRuns(rows, "yellow", CURRENT_QUALITY_RULE_VERSION),
    },
    alarmCoverage,
    items,
    pagination: { page: input.page, pageSize: input.pageSize, total: alarms.total },
  };
}
