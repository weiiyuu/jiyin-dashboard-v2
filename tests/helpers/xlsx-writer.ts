import { zipSync, strToU8 } from "fflate";
import type { CellValue, Sheet } from "read-excel-file/node";

function escapeXml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function column(index:number){let result="";for(let value=index+1;value>0;value=Math.floor((value-1)/26))result=String.fromCharCode(65+(value-1)%26)+result;return result;}
function cell(value:CellValue|null,reference:string){if(value===null||value===undefined)return`<c r="${reference}"/>`;if(typeof value==="number")return`<c r="${reference}"><v>${value}</v></c>`;if(typeof value==="boolean")return`<c r="${reference}" t="b"><v>${value?1:0}</v></c>`;const text=value instanceof Date?value.toISOString():String(value);return`<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;}
function worksheet(data:Array<Array<CellValue|null>>){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>cell(value,`${column(columnIndex)}${rowIndex+1}`)).join("")}</row>`).join("")}</sheetData></worksheet>`;}

export function createSyntheticXlsx(sheets:Sheet[]):Buffer{
  const overrides=sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets=sheets.map((sheet,index)=>`<sheet name="${escapeXml(sheet.sheet)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join("");
  const relationships=sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join("");
  const files:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`),
    "_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml":strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`),
  };
  sheets.forEach((sheet,index)=>{files[`xl/worksheets/sheet${index+1}.xml`]=strToU8(worksheet(sheet.data));});
  return Buffer.from(zipSync(files,{level:6}));
}
