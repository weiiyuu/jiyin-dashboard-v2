export const LAMP_STATES = ["GREEN", "YELLOW", "RED", "BLUE", "WHITE", "OTHER", "UNKNOWN"] as const;
export type LampState = (typeof LAMP_STATES)[number];
export type Freshness = "FRESH" | "STALE" | "NO_DATA";
export type ConnectionStatus = "HEALTHY" | "PARTIAL" | "FAILED" | "OUTSIDE_WINDOW" | "NEVER_POLLED";

export type LampValues = Record<"blue" | "green" | "red" | "white" | "yellow", unknown>;

export interface LampDecision {
  state: LampState;
  activeColors: Array<"BLUE" | "GREEN" | "RED" | "WHITE" | "YELLOW">;
  warnings: string[];
}

const lampKeys = ["blue", "green", "red", "white", "yellow"] as const;

export function decideLampState(values: Partial<LampValues> | null | undefined): LampDecision {
  if (!values || lampKeys.some((key) => values[key] !== 0 && values[key] !== 1)) {
    return { state: "UNKNOWN", activeColors: [], warnings: ["LAMP_INVALID_VALUES"] };
  }
  const activeColors = lampKeys.filter((key) => values[key] === 1).map((key) => key.toUpperCase()) as LampDecision["activeColors"];
  if (activeColors.length === 0) return { state: "UNKNOWN", activeColors, warnings: ["LAMP_ALL_ZERO"] };
  if (activeColors.length > 1) return { state: "OTHER", activeColors, warnings: ["LAMP_MULTIPLE_ACTIVE"] };
  return { state: activeColors[0], activeColors, warnings: [] };
}

export function determineFreshness(updateAtMs: number | null, nowMs: number, staleAfterSeconds: number): Freshness {
  if (updateAtMs === null) return "NO_DATA";
  return nowMs - updateAtMs > staleAfterSeconds * 1000 ? "STALE" : "FRESH";
}
