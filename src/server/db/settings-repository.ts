import type { AppDatabase } from "./connection";
import { transaction } from "./connection";
import type { ProviderMode } from "@/shared/contracts/api-response";

export interface AppSettings {
  providerMode: ProviderMode;
  modeRevision: number;
  staleAfterSeconds: number;
  liveRetentionDays: number;
  metadataRefreshSeconds: number;
  updatedAtMs: number;
}

export function getSettings(db: AppDatabase): AppSettings {
  const row = db.prepare(`SELECT provider_mode, mode_revision, stale_after_seconds,
    live_retention_days, metadata_refresh_seconds, updated_at_ms
    FROM app_settings WHERE singleton_id = 1`).get() as Record<string, string | number> | undefined;
  if (!row) throw new Error("app_settings singleton is missing");
  return {
    providerMode: row.provider_mode as ProviderMode,
    modeRevision: Number(row.mode_revision),
    staleAfterSeconds: Number(row.stale_after_seconds),
    liveRetentionDays: Number(row.live_retention_days),
    metadataRefreshSeconds: Number(row.metadata_refresh_seconds),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

export function switchProviderMode(db: AppDatabase, mode: ProviderMode, expectedRevision: number, nowMs = Date.now()): AppSettings {
  if (expectedRevision < 0 || !Number.isInteger(expectedRevision)) throw new Error("Invalid expected revision");
  return transaction(db, () => {
    const result = db.prepare(`UPDATE app_settings SET provider_mode=?, mode_revision=mode_revision+1, updated_at_ms=?
      WHERE singleton_id=1 AND mode_revision=?`).run(mode, nowMs, expectedRevision);
    if (result.changes !== 1) throw new Error("MODE_REVISION_CONFLICT");
    return getSettings(db);
  });
}

export function switchProviderModeCas(db:AppDatabase,mode:ProviderMode,expectedMode:ProviderMode,expectedRevision:number,nowMs=Date.now()):AppSettings{
  if(expectedRevision<0||!Number.isInteger(expectedRevision))throw new Error("Invalid expected revision");
  return transaction(db,()=>{
    const result=db.prepare(`UPDATE app_settings SET provider_mode=?,mode_revision=mode_revision+1,updated_at_ms=?
      WHERE singleton_id=1 AND provider_mode=? AND mode_revision=?`).run(mode,nowMs,expectedMode,expectedRevision);
    if(result.changes!==1)throw new Error("MODE_REVISION_CONFLICT");
    return getSettings(db);
  });
}
