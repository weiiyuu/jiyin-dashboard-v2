import type { AppDatabase } from "./connection";

function validateDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Invalid source date");}
function validateMachines(machineIds:string[]){if(machineIds.length===0||machineIds.some((id)=>!/^[AB][1-4]$/.test(id)))throw new Error("Invalid machine ID");}

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

export function getActiveMachineIntervalsBySourceDate(db:AppDatabase,machineIds:string[],startDate:string,endDate:string){
  validateMachines(machineIds);validateDate(startDate);validateDate(endDate);
  const placeholders=machineIds.map(()=>"?").join(",");
  return db.prepare(`SELECT h.* FROM history_machine_intervals h
    JOIN import_batches b ON b.batch_id=h.batch_id
    WHERE b.status='ACTIVE' AND h.machine_id IN (${placeholders})
      AND h.source_date>=? AND h.source_date<=?
    ORDER BY h.interval_start_ms,h.machine_id,h.machine_interval_id`).all(...machineIds,startDate,endDate) as Array<Record<string,unknown>>;
}

export function getActiveBatchCoverage(db:AppDatabase,startDate:string,endDate:string){
  validateDate(startDate);validateDate(endDate);
  return db.prepare(`SELECT b.batch_id,b.source_date,b.alarm_source_status,b.alarm_row_count
    FROM import_batches b WHERE b.status='ACTIVE' AND b.source_date>=? AND b.source_date<=?
    ORDER BY b.source_date`).all(startDate,endDate) as Array<{batch_id:number;source_date:string;alarm_source_status:string;alarm_row_count:number}>;
}

export interface AlarmQuery {startDate:string;endDate:string;sensorIds?:string[];sensorType?:string;ruleName?:string;page:number;pageSize:number}
export function getActiveAlarmEvents(db:AppDatabase,input:AlarmQuery){
  validateDate(input.startDate);validateDate(input.endDate);
  if(!Number.isInteger(input.page)||input.page<1||!Number.isInteger(input.pageSize)||input.pageSize<1||input.pageSize>200)throw new Error("Invalid pagination");
  const clauses=["b.status='ACTIVE'","h.source_date>=?","h.source_date<=?"];const parameters:Array<string|number|null>=[input.startDate,input.endDate];
  if(input.sensorIds?.length){clauses.push(`h.sensor_id IN (${input.sensorIds.map(()=>"?").join(",")})`);parameters.push(...input.sensorIds);}
  if(input.sensorType){clauses.push("h.sensor_type=?");parameters.push(input.sensorType);}
  if(input.ruleName){clauses.push("h.rule_name=?");parameters.push(input.ruleName);}
  const where=clauses.join(" AND ");
  const total=(db.prepare(`SELECT COUNT(*) count FROM history_alarm_events h JOIN import_batches b ON b.batch_id=h.batch_id WHERE ${where}`).get(...parameters) as {count:number}).count;
  const rows=db.prepare(`SELECT h.* FROM history_alarm_events h JOIN import_batches b ON b.batch_id=h.batch_id
    WHERE ${where} ORDER BY h.event_at_ms DESC,h.alarm_event_id DESC LIMIT ? OFFSET ?`).all(...parameters,input.pageSize,(input.page-1)*input.pageSize) as Array<Record<string,unknown>>;
  return{rows,total};
}
