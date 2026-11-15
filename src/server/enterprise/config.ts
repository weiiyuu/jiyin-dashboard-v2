import { readFileSync } from "node:fs";
import type { AgentOptions } from "node:https";
import { EnterpriseClientError } from "./types";

export type EnterpriseTlsMode = "strict" | "custom_ca" | "allowlisted_self_signed";
export type EnterpriseAuthMode = "none" | "bearer" | "header";

export interface EnterpriseClientConfig {
  origin: string;
  tlsMode: EnterpriseTlsMode;
  authMode: EnterpriseAuthMode;
  authValue?: string;
  authHeaderName?: string;
  timeoutMs: number;
  maxResponseBytes: number;
  ca?: string;
}

const FORBIDDEN_HEADERS = new Set([
  "host", "connection", "content-length", "cookie", "set-cookie", "transfer-encoding", "upgrade", "proxy-authorization",
]);

function positiveInteger(raw: string | undefined, fallback: number, name: string) {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new EnterpriseClientError("CONFIG", `${name} 設定無效`);
  return value;
}

export function loadEnterpriseClientConfig(env: Record<string,string|undefined> = process.env): EnterpriseClientConfig {
  const originRaw = env.ENTERPRISE_API_ORIGIN;
  if (!originRaw) throw new EnterpriseClientError("CONFIG", "企業 API 尚未設定");
  let url: URL;
  try { url = new URL(originRaw); } catch { throw new EnterpriseClientError("CONFIG", "企業 API Origin 格式無效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new EnterpriseClientError("CONFIG", "企業 API Origin 必須是無路徑、帳密或查詢字串的 HTTPS origin");
  }
  const allowed = new Set((env.ENTERPRISE_API_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!allowed.has(url.origin)) throw new EnterpriseClientError("CONFIG", "企業 API Origin 不在允許清單");

  const tlsMode = (env.ENTERPRISE_TLS_MODE ?? "strict") as EnterpriseTlsMode;
  if (!["strict", "custom_ca", "allowlisted_self_signed"].includes(tlsMode)) {
    throw new EnterpriseClientError("CONFIG", "企業 TLS mode 無效");
  }
  let ca: string | undefined;
  if (tlsMode === "custom_ca") {
    const caFile = env.ENTERPRISE_CA_FILE;
    if (!caFile) throw new EnterpriseClientError("CONFIG", "custom_ca 需要 CA 檔案");
    try { ca = readFileSync(caFile, "utf8"); } catch { throw new EnterpriseClientError("CONFIG", "無法讀取企業 CA 檔案"); }
  }

  const authMode = (env.ENTERPRISE_API_AUTH_MODE ?? "none") as EnterpriseAuthMode;
  if (!["none", "bearer", "header"].includes(authMode)) throw new EnterpriseClientError("CONFIG", "企業 API auth mode 無效");
  const authValue = env.ENTERPRISE_API_AUTH_VALUE;
  if (authMode !== "none" && !authValue) throw new EnterpriseClientError("CONFIG", "企業 API 認證值尚未設定");
  const authHeaderName = env.ENTERPRISE_API_AUTH_HEADER_NAME;
  if (authMode === "header") {
    if (!authHeaderName || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(authHeaderName) || FORBIDDEN_HEADERS.has(authHeaderName.toLowerCase())) {
      throw new EnterpriseClientError("CONFIG", "企業 API 自訂 header 名稱無效");
    }
  }

  return {
    origin: url.origin,
    tlsMode,
    authMode,
    ...(authValue === undefined ? {} : { authValue }),
    ...(authHeaderName === undefined ? {} : { authHeaderName }),
    timeoutMs: positiveInteger(env.API_TIMEOUT_MS, 10_000, "API_TIMEOUT_MS"),
    maxResponseBytes: positiveInteger(env.API_MAX_RESPONSE_BYTES, 2_097_152, "API_MAX_RESPONSE_BYTES"),
    ...(ca === undefined ? {} : { ca }),
  };
}

export function tlsAgentOptions(config: EnterpriseClientConfig): AgentOptions {
  if (config.tlsMode === "allowlisted_self_signed") return { rejectUnauthorized: false };
  if (config.tlsMode === "custom_ca") return { rejectUnauthorized: true, ca: config.ca };
  return { rejectUnauthorized: true };
}

export function safeEnterpriseConfig(config: EnterpriseClientConfig) {
  return { tlsMode: config.tlsMode, authMode: config.authMode };
}
