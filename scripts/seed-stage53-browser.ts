import { existsSync } from "node:fs";
import { openDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { confirmImport } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { standardizedWorkbook } from "../tests/fixtures/standardized-workbook";

const output = process.argv[2];
if (!output) throw new Error("Usage: tsx scripts/seed-stage53-browser.ts <new-sqlite-path>");
if (existsSync(output)) throw new Error(`Refusing to overwrite existing database: ${output}`);

const machineIds = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const dates = ["2025-02-28", "2025-03-29", ...Array.from({ length: 14 }, (_, index) => `2025-06-${String(index + 1).padStart(2, "0")}`)];

function dateTime(date: string, minute: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMinutes(minute);
  return `${day.toISOString().slice(0, 10)} ${day.toISOString().slice(11, 19)}`;
}

function label(minute: number) {
  if (minute === 1440) return "24:00";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function workbook(date: string) {
  const sheets = standardizedWorkbook(date);
  const rows: typeof sheets[0]["data"] = [];
  for (const [machineIndex, machineId] of machineIds.entries()) {
    // Public UAT shapes: one missing machine/day, two overlapping zero-Green
    // series, and one full-day Green series. These values are synthetic only.
    if (date === "2025-06-02" && machineId === "A3") continue;
    for (let slot = 0; slot < 480; slot += 1) {
      const startMinute = slot * 3;
      const endMinute = startMinute + 3;
      const severe = date === "2025-06-04" && machineId === "A1" && endMinute === 54;
      const overlapZero = date === "2025-06-01" && (machineId === "A1" || machineId === "A4");
      const fullGreen = date === "2025-06-01" && machineId === "A2";
      const green = severe ? 10 : overlapZero ? 0 : fullGreen ? 180 : 60 + machineIndex * 9 + (slot % 5) * 4;
      const yellow = severe ? 5 : overlapZero ? 180 : fullGreen ? 0 : 20 + (slot % 3) * 4;
      const red = severe ? 5 : overlapZero || fullGreen ? 0 : slot % 17 === 0 ? 8 : 0;
      const none = severe || overlapZero || fullGreen ? 0 : 180 - green - yellow - red;
      const total = none + red + yellow + green;
      rows.push([
        date,
        label(endMinute),
        dateTime(date, startMinute),
        dateTime(date, endMinute),
        machineId,
        machineId[0],
        none,
        red,
        yellow,
        green,
        0,
        0,
        total,
        green / 3600,
        yellow / 3600,
        red / 3600,
        none / 3600,
        total ? green / total : null,
        total - none ? green / (total - none) : null,
        severe ? "警告" : "正常",
        severe ? "三分鐘秒數嚴重不足" : null,
      ]);
    }
  }
  sheets[0].data.splice(1, sheets[0].data.length - 1, ...rows);
  sheets[3].data.splice(1, sheets[3].data.length - 1);
  if (date === "2025-06-04") sheets[3].data.push([date, "00:54", "A1", "三分鐘秒數嚴重不足", 20]);
  sheets[5].data.find((row) => row[0] === "機台三分鐘筆數")![1] = rows.length;
  return sheets;
}

const db = openDatabase(output);
try {
  applyMigrations(db);
  for (const date of dates) {
    const preview = parseWorkbookSheets(workbook(date), Buffer.from(`stage53-public-synthetic-${date}`));
    if (!preview.canConfirm) throw new Error(`Synthetic workbook rejected for ${date}`);
    confirmImport(db, preview, { nowMs: Date.parse(`${date}T12:00:00Z`) });
  }
  const batches = db.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE status='ACTIVE'").get() as { count: number };
  const intervals = db.prepare("SELECT COUNT(*) AS count FROM history_machine_intervals").get() as { count: number };
  console.log(JSON.stringify({ output, activeBatches: batches.count, machineIntervals: intervals.count, dates }));
} finally {
  db.close();
}
