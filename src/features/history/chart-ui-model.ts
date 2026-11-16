export type TrendAxisMode =
  | "RANGE_DAY_30"
  | "RANGE_DAY_60"
  | "RANGE_MULTI"
  | "COMPARE_DAY"
  | "COMPARE_WEEK"
  | "COMPARE_MONTH";

export interface TrendAxisTick {
  index: number;
  label: string;
}

function rounded(value: number) {
  return Number(value.toPrecision(12));
}

export function formatDurationHours(hours: number, unit: "HOURS" | "HOURS_PER_DAY" = "HOURS") {
  const suffix = unit === "HOURS_PER_DAY" ? "／日" : "";
  if (hours === 0) return `0 分${suffix}`;
  if (hours > 0 && hours * 3600 < 60) return `不足 1 分${suffix}`;
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes} 分${suffix}`;
  return `${wholeHours} 小時${minutes ? ` ${minutes} 分` : ""}${suffix}`;
}

export function formatSignedDurationHours(hours: number | null, unit: "HOURS" | "HOURS_PER_DAY" = "HOURS") {
  if (hours === null) return "無法計算";
  if (hours === 0) return formatDurationHours(0, unit);
  return `${hours > 0 ? "+" : "−"}${formatDurationHours(Math.abs(hours), unit)}`;
}

export function niceHourScale(maxValue: number, zeroFallback = 1) {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : zeroFallback;
  const rawStep = safeMax / 5;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  const niceFraction = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= fraction) ?? 10;
  const step = rounded(niceFraction * magnitude);
  const max = rounded(Math.ceil(safeMax / step) * step);
  const count = Math.round(max / step);
  return { max, step, ticks: Array.from({ length: count + 1 }, (_, index) => rounded(index * step)) };
}

export function capacityHourScale(dataMax: number, capacity: number, zeroFallback = 1) {
  const safeCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : zeroFallback;
  if (dataMax > safeCapacity) return { ...niceHourScale(dataMax, zeroFallback), exceeded: true };
  const nice = niceHourScale(safeCapacity, zeroFallback);
  const ticks = [...nice.ticks.filter((tick) => tick < safeCapacity), safeCapacity];
  return { max: safeCapacity, step: nice.step, ticks: [...new Set(ticks)], exceeded: false };
}

export function regularTickIndexes(length: number, maximumTicks = 8) {
  if (length <= 0) return [];
  const step = Math.max(1, Math.ceil(length / maximumTicks));
  return Array.from({ length: Math.ceil(length / step) }, (_, index) => index * step).filter((index) => index < length);
}

export function niceIntegerScale(maxValue: number, maximumIntervals = 5) {
  const safeMax = Math.max(1, Math.ceil(Number.isFinite(maxValue) ? maxValue : 0));
  const rawStep = safeMax / maximumIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, rawStep)));
  const fraction = rawStep / magnitude;
  const niceFraction = [1, 2, 5, 10].find((candidate) => candidate >= fraction) ?? 10;
  const step = Math.max(1, niceFraction * magnitude);
  const max = Math.ceil(safeMax / step) * step;
  return { max, step, ticks: Array.from({ length: max / step + 1 }, (_, index) => index * step) };
}

function shortDate(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[1]}/${match[2]}` : value;
}

export function buildTrendAxisLabels(mode: TrendAxisMode, positions: string[]): { ticks: TrendAxisTick[]; endLabel?: string } {
  if (mode === "RANGE_DAY_30") {
    return { ticks: Array.from({ length: 8 }, (_, index) => ({ index: index * 6, label: `${String(index * 3).padStart(2, "0")}:00` })), endLabel: "24:00" };
  }
  if (mode === "RANGE_DAY_60" || mode === "COMPARE_DAY") {
    return { ticks: Array.from({ length: 8 }, (_, index) => ({ index: index * 3, label: `${String(index * 3).padStart(2, "0")}:00` })), endLabel: "24:00" };
  }
  if (mode === "COMPARE_WEEK") {
    return { ticks: positions.map((_, index) => ({ index, label: `第${index + 1}天` })) };
  }
  if (mode === "COMPARE_MONTH") {
    const indexes = [0, 4, 9, 14, 19, 24, 30].filter((index) => index < positions.length);
    return { ticks: indexes.map((index) => ({ index, label: `${index + 1}日` })) };
  }
  return { ticks: regularTickIndexes(positions.length).map((index) => ({ index, label: shortDate(positions[index] ?? "") })) };
}

export function formatAxisHours(value: number, step: number, unit: "HOURS" | "HOURS_PER_DAY" = "HOURS") {
  const decimals = step < .1 ? 2 : step < 1 ? 1 : 0;
  const number = value.toFixed(decimals).replace(/\.0+$/, "");
  return `${number} ${unit === "HOURS_PER_DAY" ? "小時／日" : "小時"}`;
}

export function formatDateDisplay(value: string) {
  return value.replace(/-/g, "/");
}

export type ComparisonKind = "day" | "week" | "month";

function addUtcDays(value: string, days: number) {
  const epoch = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch + days * 86_400_000).toISOString().slice(0, 10);
}

export function comparisonInputRange(kind: ComparisonKind, value: string) {
  if (kind === "month") {
    if (!/^\d{4}-\d{2}$/.test(value)) return null;
    const [year, month] = value.split("-").map(Number);
    if (month < 1 || month > 12) return null;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${formatDateDisplay(`${value}-01`)} – ${formatDateDisplay(`${value}-${String(days).padStart(2, "0")}`)}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const end = kind === "week" ? addUtcDays(value, 6) : value;
  return end ? `${formatDateDisplay(value)}${end === value ? "" : ` – ${formatDateDisplay(end)}`}` : null;
}

export function rangeGrainControl(startDate: string, endDate: string, bucket: "30m" | "60m") {
  const daily = Boolean(startDate && endDate && startDate !== endDate);
  return { value: daily ? "daily" as const : bucket, disabled: daily, label: daily ? "每日統計（跨日固定）" : bucket === "30m" ? "30 分鐘" : "60 分鐘" };
}
