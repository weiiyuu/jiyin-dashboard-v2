export const REQUIRED_SHEETS = [
  "machine_3min", "environment_3min", "alarm_events", "quality_issues", "data_dictionary", "README",
] as const;

export type RequiredSheet = (typeof REQUIRED_SHEETS)[number];
export type AlarmSourceStatus = "PROVIDED_NONEMPTY" | "PROVIDED_EMPTY" | "MISSING" | "UNKNOWN";
export type IssueSeverity = "ERROR" | "SEVERE" | "WARNING" | "INFO";

export interface ImportIssue {
  ruleCode: string;
  severity: IssueSeverity;
  sheetName?: string;
  sourceRowNumber?: number;
  columnName?: string;
  metricScope?: string;
  messageSafe: string;
}

export interface MachineImportRow {
  sourceRowNumber: number; sourceDate: string; timeLabel: string;
  intervalStartText: string; intervalEndText: string; intervalStartMs: number; intervalEndMs: number;
  machineId: string; area: string;
  noneSeconds: number | null; redSeconds: number | null; yellowSeconds: number | null;
  greenSeconds: number | null; blueSeconds: number | null; whiteSeconds: number | null;
  sourceFourStateTotalSeconds: number | null; sourceProcessingHours: number | null;
  sourceYellowHours: number | null; sourceRedHours: number | null; sourceNoneHours: number | null;
  sourceIntervalProcessingRatio: number | null; sourcePoweredProcessingRatio: number | null;
  sourceQualityStatus: string | null; sourceQualityNote: string | null; sourceExceptionJson: string | null;
  greenHoursEligible: number; fourStateRatioEligible: number; sixStateShareEligible: number;
  transitionEligible: number; qualityRuleVersion: string; issueCodesJson: string;
}

export interface EnvironmentImportRow {
  sourceRowNumber: number; sourceDate: string; timeLabel: string;
  intervalStartText: string; intervalEndText: string; intervalStartMs: number; intervalEndMs: number;
  area: string; sensorNumber: number; category: string;
  averageValue: number | null; maximumValue: number | null; medianValue: number | null;
  minimumValue: number | null; referenceThreshold: number | null;
  sourceMaxJudgement: string | null; sourceQualityStatus: string | null; sourceNote: string | null;
  sourceExceptionJson: string | null; averageEligible: number; maximumEligible: number;
  medianEligible: number; minimumEligible: number; qualityRuleVersion: string; issueCodesJson: string;
}

export interface AlarmImportRow {
  sourceRowNumber: number; sourceDate: string; eventTimeText: string; eventAtMs: number;
  sensorName: string | null; sensorId: string; sensorType: string | null; groupText: string | null;
  ruleName: string | null; ruleConditionText: string | null; currentValueText: string | null;
  currentValueNumeric: number | null; durationOriginal: string | null;
  initialClassification: string | null; classificationStatus: string | null;
  eventFingerprint: string; duplicateWithinBatch: number; issueCodesJson: string;
}

export interface QualityIssueImportRow {
  sourceRowNumber: number; sourceDate: string; timeLabel: string | null;
  subjectText: string; problemText: string; intervalTotalSeconds: number | null;
  sourceExceptionJson: string | null;
}

export interface MetadataImportRow {
  sheetName: "data_dictionary" | "README"; sourceRowNumber: number;
  itemKey: string; valueText: string | null; noteText: string | null;
}

export interface ImportPreview {
  originalFileName: string; fileSizeBytes: number; fileSha256: string; canonicalFingerprint: string;
  contractVersion: "jiyin-v1-draft"; dictionaryVersion: string | null; sourceDate: string;
  alarmSourceStatus: AlarmSourceStatus;
  machineRows: MachineImportRow[]; environmentRows: EnvironmentImportRow[];
  alarmRows: AlarmImportRow[]; qualityIssueRows: QualityIssueImportRow[]; metadataRows: MetadataImportRow[];
  issues: ImportIssue[]; canConfirm: boolean;
}
