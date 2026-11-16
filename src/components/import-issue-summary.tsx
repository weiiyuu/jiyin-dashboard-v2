import { importIssueExplanation, importIssueLabels } from "@/features/imports/import-ui-model";

export interface ImportIssue {
  ruleCode: string;
  severity: "ERROR" | "SEVERE" | "WARNING" | "INFO";
  sheetName?: string;
  sourceRowNumber?: number;
  columnName?: string;
  messageSafe: string;
}

export function groupImportIssues(items: ImportIssue[]) {
  const grouped = new Map<string, ImportIssue[]>();
  for (const item of items) grouped.set(item.ruleCode, [...(grouped.get(item.ruleCode) ?? []), item]);
  return [...grouped.entries()];
}

export function ImportIssueSummary({ title, items }: { title: string; items: ImportIssue[] }) {
  if (!items.length) return null;
  const blocking = items.some((item) => item.severity === "ERROR");
  return <div className={`issue-summary ${blocking ? "error" : "warning"}`}>
    <strong>{title}（{items.length}）</strong>
    {groupImportIssues(items).map(([code, group]) => <details key={code}>
      <summary><span>{importIssueLabels[code] ?? "未分類資料問題"} × {group.length}</span><span>{group.slice(0, 3).map((item) => item.sourceRowNumber ? `第 ${item.sourceRowNumber} 列` : item.sheetName ?? "整檔").join("、")}</span></summary>
      <ul>{group.slice(0, 20).map((item, index) => <li key={index}>
        <strong>{item.severity === "SEVERE" ? "重要品質提醒" : item.severity === "INFO" ? "來源資訊" : item.severity === "WARNING" ? "品質提醒" : "不可匯入"}</strong> · {importIssueExplanation(item.ruleCode, item.messageSafe)}{item.sheetName ? ` · ${item.sheetName}` : ""}{item.columnName ? ` · ${item.columnName}` : ""}{item.sourceRowNumber ? ` · 第 ${item.sourceRowNumber} 列` : ""}<code>{item.ruleCode}</code>
      </li>)}</ul>
      {group.length > 20 && <p>另有 {group.length - 20} 則未展開。</p>}
    </details>)}
  </div>;
}
