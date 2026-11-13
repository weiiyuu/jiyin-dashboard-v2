const TAIPEI_OFFSET = "+08:00";

export function parseTaipeiIntervalEnd(sourceDate: string, timeLabel: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) throw new Error("Invalid source date");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeLabel) && timeLabel !== "24:00") {
    throw new Error("Invalid time label");
  }
  if (timeLabel === "24:00") {
    return Date.parse(`${sourceDate}T00:00:00${TAIPEI_OFFSET}`) + 86_400_000;
  }
  return Date.parse(`${sourceDate}T${timeLabel}:00${TAIPEI_OFFSET}`);
}

export function intervalBounds(sourceDate: string, timeLabel: string) {
  const intervalEndMs = parseTaipeiIntervalEnd(sourceDate, timeLabel);
  return { intervalStartMs: intervalEndMs - 180_000, intervalEndMs };
}

export function taipeiDateAt(epochMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
}
