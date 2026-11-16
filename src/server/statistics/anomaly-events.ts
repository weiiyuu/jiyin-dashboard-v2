export type AlarmClassification = "ENVIRONMENT_ALERT" | "NON_ANOMALY_NOTIFICATION" | "UNKNOWN";

export interface AlarmSourceForClassification {
  sensorType: string | null;
  initialClassification: string | null;
}

export function classifyAlarmSource(row: AlarmSourceForClassification): AlarmClassification {
  const classification = row.initialClassification?.toLowerCase() ?? "";
  const sensorType = row.sensorType?.toLowerCase() ?? "";
  if (classification.includes("加工完成") || classification.includes("完成通知")) return "NON_ANOMALY_NOTIFICATION";
  if (classification.includes("環境") || classification.includes("類比") && classification.includes("警示")) return "ENVIRONMENT_ALERT";
  if (sensorType.includes("analog")) return "ENVIRONMENT_ALERT";
  if (sensorType.includes("lamp")) return "NON_ANOMALY_NOTIFICATION";
  return "UNKNOWN";
}

export function parseAlarmDurationSeconds(value: string | null): number | null {
  if (value === null || !value.trim()) return null;
  const match = value.trim().match(/^(?:(\d+(?:\.\d+)?)\s*hours?\s*)?(?:(\d+(?:\.\d+)?)\s*minutes?\s*)?(?:(\d+(?:\.\d+)?)\s*seconds?\s*)?$/i);
  if (!match || !match.slice(1).some((part) => part !== undefined)) return null;
  const values = match.slice(1).map((part) => part === undefined ? 0 : Number(part));
  if (!values.every(Number.isFinite)) return null;
  return values[0] * 3600 + values[1] * 60 + values[2];
}
