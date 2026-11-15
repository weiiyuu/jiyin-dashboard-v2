import { createHash } from "node:crypto";
import type { EndpointSuccess, EnterpriseEnvelope } from "./types";
import type { CatalogInput, ReadingInput } from "@/server/db/poll-repository";

export interface LogicalSensorMapping {
  sensorId: string;
  logicalRole: "MACHINE_LAMP" | "MACHINE_COMPLETION" | "ENV_TEMPERATURE" | "ENV_HUMIDITY";
  machineId?: string;
  area: "A" | "B";
  pointNumber?: number;
}

export const LOGICAL_SENSOR_MAPPINGS: readonly LogicalSensorMapping[] = [
  { sensorId: "nav5", logicalRole: "MACHINE_LAMP", machineId: "A1", area: "A" },
  { sensorId: "zzaz", logicalRole: "MACHINE_LAMP", machineId: "A2", area: "A" },
  { sensorId: "w18j", logicalRole: "MACHINE_LAMP", machineId: "A3", area: "A" },
  { sensorId: "ookd", logicalRole: "MACHINE_LAMP", machineId: "A4", area: "A" },
  { sensorId: "1jn1", logicalRole: "MACHINE_LAMP", machineId: "B1", area: "B" },
  { sensorId: "rnnj", logicalRole: "MACHINE_LAMP", machineId: "B2", area: "B" },
  { sensorId: "ahr9", logicalRole: "MACHINE_LAMP", machineId: "B3", area: "B" },
  { sensorId: "gg70", logicalRole: "MACHINE_LAMP", machineId: "B4", area: "B" },
  { sensorId: "mvex", logicalRole: "MACHINE_COMPLETION", machineId: "A1", area: "A" },
  { sensorId: "zs3e", logicalRole: "MACHINE_COMPLETION", machineId: "A2", area: "A" },
  { sensorId: "fd0b", logicalRole: "MACHINE_COMPLETION", machineId: "A3", area: "A" },
  { sensorId: "z1dx", logicalRole: "MACHINE_COMPLETION", machineId: "A4", area: "A" },
  { sensorId: "4pi1", logicalRole: "MACHINE_COMPLETION", machineId: "B1", area: "B" },
  { sensorId: "mymo", logicalRole: "MACHINE_COMPLETION", machineId: "B2", area: "B" },
  { sensorId: "e5hb", logicalRole: "MACHINE_COMPLETION", machineId: "B3", area: "B" },
  { sensorId: "ehwz", logicalRole: "MACHINE_COMPLETION", machineId: "B4", area: "B" },
  { sensorId: "curf", logicalRole: "ENV_TEMPERATURE", area: "A", pointNumber: 1 },
  { sensorId: "c24c", logicalRole: "ENV_TEMPERATURE", area: "A", pointNumber: 2 },
  { sensorId: "a9vj", logicalRole: "ENV_HUMIDITY", area: "A", pointNumber: 1 },
  { sensorId: "5cu1", logicalRole: "ENV_HUMIDITY", area: "A", pointNumber: 2 },
  { sensorId: "coc7", logicalRole: "ENV_TEMPERATURE", area: "B", pointNumber: 1 },
  { sensorId: "4vat", logicalRole: "ENV_TEMPERATURE", area: "B", pointNumber: 2 },
  { sensorId: "ykpw", logicalRole: "ENV_HUMIDITY", area: "B", pointNumber: 1 },
  { sensorId: "e5e0", logicalRole: "ENV_HUMIDITY", area: "B", pointNumber: 2 },
] as const;

const mappingById = new Map(LOGICAL_SENSOR_MAPPINGS.map((item) => [item.sensorId, item]));

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function payloadHash(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }

interface ConfigShape { id: string; displayname: string; type: string; unit: string }
interface GroupAssignment { groupId: string; groupAlias: string; sortingId: number | null }

function parseConfigs(envelope: EnterpriseEnvelope): Map<string, ConfigShape> {
  const result = new Map<string, ConfigShape>();
  for (const [sensorId, raw] of Object.entries(envelope.data as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const config = (raw as Record<string, unknown>).config;
    if (!config || typeof config !== "object") continue;
    const entry = config as Record<string, unknown>;
    if (entry.id !== sensorId || typeof entry.displayname !== "string" || typeof entry.type !== "string" || typeof entry.unit !== "string") continue;
    result.set(sensorId, { id: sensorId, displayname: entry.displayname, type: entry.type, unit: entry.unit });
  }
  return result;
}

function parseGroups(envelope: EnterpriseEnvelope): Map<string, GroupAssignment[]> {
  const result = new Map<string, GroupAssignment[]>();
  for (const raw of envelope.data as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const group = raw as Record<string, unknown>;
    if (typeof group.groupId !== "string" || typeof group.groupAlias !== "string" || !group.sensors || typeof group.sensors !== "object") continue;
    for (const [sensorId, sensorRaw] of Object.entries(group.sensors as Record<string, unknown>)) {
      const sensor = sensorRaw && typeof sensorRaw === "object" ? sensorRaw as Record<string, unknown> : {};
      const assignment = { groupId: group.groupId, groupAlias: group.groupAlias, sortingId: typeof sensor.sortingId === "number" ? sensor.sortingId : null };
      result.set(sensorId, [...(result.get(sensorId) ?? []), assignment]);
    }
  }
  return result;
}

export function buildCatalog(configs: EndpointSuccess, groups: EndpointSuccess, nowMs: number): CatalogInput[] {
  const parsedConfigs = parseConfigs(configs.envelope);
  const parsedGroups = parseGroups(groups.envelope);
  const configHash = payloadHash(configs.envelope.data), groupHash = payloadHash(groups.envelope.data);
  return [...parsedConfigs.values()].map((config) => {
    const mapping = mappingById.get(config.id), assignments = parsedGroups.get(config.id) ?? [], assignment = assignments[0];
    return {
      sensorId: config.id, displayName: config.displayname, sensorType: config.type, unit: config.unit,
      groupId: assignment?.groupId ?? null, groupAlias: assignment?.groupAlias ?? null, groupSortingId: assignment?.sortingId ?? null,
      logicalRole: mapping?.logicalRole ?? null, machineId: mapping?.machineId ?? null, area: mapping?.area ?? null,
      pointNumber: mapping?.pointNumber ?? null, mappingStatus: assignments.length > 1 ? "CONFLICT" : mapping ? "MAPPED" : "OUT_OF_SCOPE",
      configHash, groupHash, seenAtMs: nowMs, verifiedAtMs: nowMs,
    };
  });
}

function strictNumeric(raw: unknown, unit: string | null): { text: string | null; value: number | null } {
  if (raw === null || raw === undefined) return { text: null, value: null };
  const text = String(raw), escapedUnit = unit ? unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const pattern = new RegExp(`^\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*${escapedUnit ? `(?:${escapedUnit})?` : ""}\\s*$`);
  const match = text.match(pattern), value = match ? Number(match[1]) : Number.NaN;
  return { text, value: Number.isFinite(value) ? value : null };
}

export interface CatalogLookup { sensorType: string | null; unit: string | null; mappingStatus: "MAPPED" | "STALE_MAPPING" | "UNMAPPED" }

export function parseValues(envelope: EnterpriseEnvelope, fetchedAtMs: number, catalog: Map<string, CatalogLookup>): ReadingInput[] {
  const readings: ReadingInput[] = [];
  for (const [sensorId, raw] of Object.entries(envelope.data as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.id !== sensorId || !item.values || typeof item.values !== "object" || Array.isArray(item.values)) continue;
    const rawValues = item.values as Record<string, unknown>, sensorUpdateTimeText = typeof item.updateTime === "string" ? item.updateTime : null;
    const parsedTime = sensorUpdateTimeText === null ? Number.NaN : Date.parse(sensorUpdateTimeText), sensorUpdateAtMs = Number.isFinite(parsedTime) ? parsedTime : null;
    const info = catalog.get(sensorId), type = info?.sensorType?.toLowerCase() ?? null;
    const isLamp = type === "lamp" || mappingById.get(sensorId)?.logicalRole === "MACHINE_LAMP";
    const rawStatus = typeof item.status === "number" && Number.isInteger(item.status) ? item.status : null;
    if (isLamp) {
      const keys = ["blue", "green", "red", "white", "yellow"] as const, valid = keys.every((key) => rawValues[key] === 0 || rawValues[key] === 1);
      readings.push({ sensorId, sensorUpdateTimeText, sensorUpdateAtMs, fetchedAtMs, rawStatus, rawValues, valueText:null,numericValue:null,
        lampBlue: rawValues.blue === 0 || rawValues.blue === 1 ? rawValues.blue : null, lampGreen: rawValues.green === 0 || rawValues.green === 1 ? rawValues.green : null,
        lampRed: rawValues.red === 0 || rawValues.red === 1 ? rawValues.red : null, lampWhite: rawValues.white === 0 || rawValues.white === 1 ? rawValues.white : null,
        lampYellow: rawValues.yellow === 0 || rawValues.yellow === 1 ? rawValues.yellow : null,
        parseStatus: valid && sensorUpdateAtMs !== null ? "VALID" : valid ? "PARTIAL" : "INVALID", mappingStatus: info?.mappingStatus ?? "UNMAPPED" });
      continue;
    }
    const numeric = strictNumeric(rawValues.value, info?.unit ?? null);
    readings.push({ sensorId, sensorUpdateTimeText, sensorUpdateAtMs, fetchedAtMs, rawStatus, rawValues, valueText:numeric.text,numericValue:numeric.value,
      lampBlue:null,lampGreen:null,lampRed:null,lampWhite:null,lampYellow:null,
      parseStatus:type===null?"UNKNOWN_TYPE":numeric.value===null?"PARTIAL":sensorUpdateAtMs===null?"PARTIAL":"VALID",mappingStatus:info?.mappingStatus??"UNMAPPED" });
  }
  return readings;
}
