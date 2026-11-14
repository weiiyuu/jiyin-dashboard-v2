import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fullDayStandardizedWorkbook } from "../tests/fixtures/full-day-workbook";
import { standardizedWorkbook } from "../tests/fixtures/standardized-workbook";
import { createSyntheticXlsx } from "../tests/helpers/xlsx-writer";

const target=process.argv[2];
if(!target)throw new Error("Output directory is required");
mkdirSync(target,{recursive:true});
const paths:string[]=[];
for(let index=0;index<8;index++){
  const sourceDate=`2025-09-${String(index+1).padStart(2,"0")}`,path=resolve(target,`${sourceDate}-full.xlsx`);
  writeFileSync(path,createSyntheticXlsx(fullDayStandardizedWorkbook(sourceDate)));paths.push(path);
}
const warning=standardizedWorkbook("2025-09-10");warning[2].data.push(["2025-09-10 01:00:00",null,"sensor-warning",null,null,null,null,null,null,null,null]);warning[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
const warningPath=resolve(target,"2025-09-10-null-warning.xlsx");writeFileSync(warningPath,createSyntheticXlsx(warning));paths.push(warningPath);
const invalid=standardizedWorkbook("2025-09-11");invalid[0].data[0]=invalid[0].data[0].filter((name)=>name!=="機台");
const invalidPath=resolve(target,"2025-09-11-invalid.xlsx");writeFileSync(invalidPath,createSyntheticXlsx(invalid));paths.push(invalidPath);
console.log(paths.join("\n"));
