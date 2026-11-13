import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { previewWorkbook } from "@/server/import/workbook-parser";
import { openDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { confirmImport } from "@/server/import/import-repository";

const privateWorkbook = join(process.cwd(), "_reference_inputs", "標準化後每日資料_2025-06-01.xlsx");

describe("private standardized workbook contract", () => {
  it.skipIf(!existsSync(privateWorkbook))("matches the approved local-only row counts", async () => {
    const preview = await previewWorkbook(readFileSync(privateWorkbook), "private-contract.xlsx");
    expect(preview.sourceDate).toBe("2025-06-01");
    expect(preview.machineRows).toHaveLength(3_840);
    expect(preview.environmentRows).toHaveLength(3_840);
    expect(preview.alarmRows).toHaveLength(11);
    expect(preview.qualityIssueRows).toHaveLength(0);
    expect(preview.canConfirm).toBe(true);

    const root=mkdtempSync(join(tmpdir(),"jiyin-private-contract-"));
    const db=openDatabase(join(root,"contract.sqlite"));
    try {
      applyMigrations(db);
      expect(confirmImport(db,preview,{nowMs:1}).outcome).toBe("IMPORTED");
      expect(db.prepare("SELECT COUNT(*) count FROM history_machine_intervals").get()).toEqual({count:3_840});
      expect(db.prepare("SELECT COUNT(*) count FROM history_environment_intervals").get()).toEqual({count:3_840});
      expect(db.prepare("SELECT COUNT(*) count FROM history_alarm_events").get()).toEqual({count:11});
    } finally {
      db.close();
      rmSync(root,{recursive:true,force:true});
    }
  });
});
