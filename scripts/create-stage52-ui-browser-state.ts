import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "../src/server/db/connection";
import { applyMigrations } from "../src/server/db/migrations";
import { confirmImport } from "../src/server/import/import-repository";
import { parseWorkbookSheets } from "../src/server/import/workbook-parser";
import { standardizedWorkbook } from "../tests/fixtures/standardized-workbook";
import { createSyntheticXlsx } from "../tests/helpers/xlsx-writer";

const databasePath=process.argv[2],fixtureDirectory=process.argv[3];
if(!databasePath||!fixtureDirectory)throw new Error("Usage: create-stage52-ui-browser-state <database> <fixture-directory>");
mkdirSync(fixtureDirectory,{recursive:true});
const db=openDatabase(databasePath);applyMigrations(db);

for(let day=1;day<=20;day++){
  const sourceDate=`2025-08-${String(day).padStart(2,"0")}`;
  confirmImport(db,parseWorkbookSheets(standardizedWorkbook(sourceDate),Buffer.from(`seed-${sourceDate}`),`${sourceDate}-seed.xlsx`),{nowMs:Date.UTC(2025,7,day,1)});
}
const replacement=standardizedWorkbook("2025-08-01");replacement[0].data[1][9]=90;replacement[0].data[1][12]=90;replacement[0].data[1][13]=.025;
confirmImport(db,parseWorkbookSheets(replacement,Buffer.from("seed-replacement"),"2025-08-01-revision.xlsx"),{replace:true,expectedActiveBatchId:1,nowMs:Date.UTC(2025,7,22,1)});

const selectedDates=["2025-08-01","2025-08-02","2025-09-01","2025-09-02","2025-09-03"];
for(const sourceDate of selectedDates){
  const sheets=standardizedWorkbook(sourceDate);
  if(sourceDate==="2025-09-02"){
    sheets[2].data.push([`${sourceDate} 01:00:00`,null,"sensor-warning",null,null,null,null,null,null,null,null]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
  }
  writeFileSync(resolve(fixtureDirectory,`${sourceDate}-browser.xlsx`),createSyntheticXlsx(sheets));
}
db.close();
console.log(JSON.stringify({databasePath,fixtureDirectory,versionCount:21,previewFiles:5}));
