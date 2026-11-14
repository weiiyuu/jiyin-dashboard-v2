import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { previewWorkbook } from "@/server/import/workbook-parser";
import { openDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { confirmImport } from "@/server/import/import-repository";
import { getActiveMachineIntervalsBySourceDate } from "@/server/db/history-repository";
import { calculateGreenHours, type StatisticInterval } from "@/server/statistics/history-statistics";
import { CURRENT_QUALITY_RULE_VERSION } from "@/server/import/workbook-parser";

const privateWorkbook = join(process.cwd(), "_reference_inputs", "標準化後每日資料_2025-06-01.xlsx");

describe("private standardized workbook contract", () => {
  it.skipIf(!existsSync(privateWorkbook))("matches the approved local-only row counts", async () => {
    const preview = await previewWorkbook(readFileSync(privateWorkbook), "private-contract.xlsx");
    expect(preview.sourceDate).toBe("2025-06-01");
    expect(preview.machineRows).toHaveLength(3_840);
    expect(preview.environmentRows).toHaveLength(3_840);
    expect(preview.alarmRows).toHaveLength(11);
    expect(preview.qualityIssueRows).toHaveLength(0);
    expect(preview.issues.filter((issue)=>issue.severity==="ERROR")).toEqual([]);
    expect(preview.canConfirm).toBe(true);

    const root=mkdtempSync(join(tmpdir(),"jiyin-private-contract-"));
    const db=openDatabase(join(root,"contract.sqlite"));
    try {
      applyMigrations(db);
      expect(confirmImport(db,preview,{nowMs:1}).outcome).toBe("IMPORTED");
      expect(db.prepare("SELECT COUNT(*) count FROM history_machine_intervals").get()).toEqual({count:3_840});
      expect(db.prepare("SELECT COUNT(*) count FROM history_environment_intervals").get()).toEqual({count:3_840});
      expect(db.prepare("SELECT COUNT(*) count FROM history_alarm_events").get()).toEqual({count:11});
      const first=preview.machineRows[0];
      expect(db.prepare(`SELECT source_date,time_label,interval_start_text,interval_end_text,machine_id,area,
        none_seconds,red_seconds,yellow_seconds,green_seconds,blue_seconds,white_seconds,source_exception_json
        FROM history_machine_intervals WHERE source_row_number=? AND machine_id=?`).get(first.sourceRowNumber,first.machineId)).toEqual({
          source_date:first.sourceDate,time_label:first.timeLabel,interval_start_text:first.intervalStartText,interval_end_text:first.intervalEndText,
          machine_id:first.machineId,area:first.area,none_seconds:first.noneSeconds,red_seconds:first.redSeconds,yellow_seconds:first.yellowSeconds,
          green_seconds:first.greenSeconds,blue_seconds:first.blueSeconds,white_seconds:first.whiteSeconds,source_exception_json:first.sourceExceptionJson,
        });
      const active=getActiveMachineIntervalsBySourceDate(db,["A1"],preview.sourceDate,preview.sourceDate).map((row)=>({
        machineId:String(row.machine_id),sourceDate:String(row.source_date),timeLabel:String(row.time_label),intervalStartMs:Number(row.interval_start_ms),intervalEndMs:Number(row.interval_end_ms),
        noneSeconds:row.none_seconds as number|null,redSeconds:row.red_seconds as number|null,yellowSeconds:row.yellow_seconds as number|null,greenSeconds:row.green_seconds as number|null,blueSeconds:row.blue_seconds as number|null,whiteSeconds:row.white_seconds as number|null,
        greenHoursEligible:Boolean(row.green_hours_eligible),sixStateShareEligible:Boolean(row.six_state_share_eligible),transitionEligible:Boolean(row.transition_eligible),qualityRuleVersion:String(row.quality_rule_version),
      } satisfies StatisticInterval));
      const expectedSeconds=preview.machineRows.filter((row)=>row.machineId==="A1"&&row.greenHoursEligible===1).reduce((sum,row)=>sum+(row.greenSeconds??0),0);
      expect(calculateGreenHours(active,CURRENT_QUALITY_RULE_VERSION,480).seconds).toBe(expectedSeconds);
    } finally {
      db.close();
      rmSync(root,{recursive:true,force:true});
    }
  });
});
