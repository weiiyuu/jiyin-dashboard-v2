import type { AppDatabase } from "./connection";

export function getActiveMachineIntervals(db: AppDatabase, machineIds: string[], fromMs: number, toMs: number) {
  if (machineIds.length === 0) return [];
  if (machineIds.some((id) => !/^[AB][1-4]$/.test(id))) throw new Error("Invalid machine ID");
  const placeholders = machineIds.map(() => "?").join(",");
  return db.prepare(`SELECT h.* FROM history_machine_intervals h
    JOIN import_batches b ON b.batch_id=h.batch_id
    WHERE b.status='ACTIVE' AND h.machine_id IN (${placeholders})
      AND h.interval_start_ms>=? AND h.interval_start_ms<?
    ORDER BY h.interval_start_ms, h.machine_id`).all(...machineIds, fromMs, toMs);
}

export function explainActiveMachineQuery(db: AppDatabase, machineId: string, fromMs: number, toMs: number): string[] {
  return (db.prepare(`EXPLAIN QUERY PLAN SELECT h.* FROM history_machine_intervals h
    JOIN import_batches b ON b.batch_id=h.batch_id
    WHERE b.status='ACTIVE' AND h.machine_id=? AND h.interval_start_ms>=? AND h.interval_start_ms<?`).all(machineId, fromMs, toMs) as Array<{ detail: string }>).map((row) => row.detail);
}
