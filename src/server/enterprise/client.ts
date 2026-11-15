import { Agent, request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";
import { tlsAgentOptions, type EnterpriseClientConfig } from "./config";
import {
  EnterpriseClientError,
  type EndpointSuccess,
  type EnterpriseEndpoint,
  type EnterpriseEnvelope,
} from "./types";

const PATHS: Record<EnterpriseEndpoint, string> = {
  values: "/api/sensors/values",
  configs: "/api/sensors/configs",
  groups: "/api/sensors/groups",
};

const COMMON_FIELDS = [
  "apiType", "apiVersion", "data", "localTime", "responseCode", "responseMsg", "responseTime", "thingAlias", "thingName",
] as const;

function authHeaders(config: EnterpriseClientConfig): Record<string, string> {
  if (config.authMode === "bearer") return { Authorization: `Bearer ${config.authValue}` };
  if (config.authMode === "header") return { [config.authHeaderName!]: config.authValue! };
  return {};
}

export function classifyTransportError(error: unknown): EnterpriseClientError {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ETIMEDOUT" || code === "ABORT_ERR") return new EnterpriseClientError("TIMEOUT", "企業 API 請求逾時", null, true);
  if (["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code)) {
    return new EnterpriseClientError("TLS_CERTIFICATE", "企業 API TLS 憑證驗證失敗");
  }
  return new EnterpriseClientError("NETWORK", "企業 API 網路連線失敗", null, true);
}

export function validateHttpStatus(status:number){
  if(status>=300&&status<400)throw new EnterpriseClientError("REDIRECT","企業 API 不允許重新導向",status);
  if(status<200||status>=300)throw new EnterpriseClientError("HTTP_STATUS",`企業 API 回應 HTTP ${status}`,status,status>=500);
}

export function assertResponseSize(size:number,max:number,status=200){if(size>max)throw new EnterpriseClientError("RESPONSE_TOO_LARGE","企業 API 回應超過大小限制",status);}

export function validateEnvelope(endpoint: EnterpriseEndpoint, input: unknown): EnterpriseEnvelope {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new EnterpriseClientError("SCHEMA", "企業 API 回應根節點格式不符");
  const value = input as Record<string, unknown>;
  if (COMMON_FIELDS.some((field) => !(field in value)) || typeof value.responseCode !== "string") {
    throw new EnterpriseClientError("SCHEMA", "企業 API 共通欄位不完整");
  }
  if (value.responseCode !== "00") throw new EnterpriseClientError("API_RESPONSE", "企業 API 回報非成功狀態");
  if ((endpoint === "groups" && !Array.isArray(value.data)) || (endpoint !== "groups" && (!value.data || typeof value.data !== "object" || Array.isArray(value.data)))) {
    throw new EnterpriseClientError("SCHEMA", `企業 API ${endpoint} data 格式不符`);
  }
  if(endpoint==="values")for(const [sensorId,raw] of Object.entries(value.data as Record<string,unknown>)){
    const item=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
    if(!item||item.id!==sensorId||typeof item.updateTime!=="string"||!item.values||typeof item.values!=="object"||Array.isArray(item.values))throw new EnterpriseClientError("SCHEMA","企業 API values sensor 格式不符");
  }
  if(endpoint==="configs")for(const [sensorId,raw] of Object.entries(value.data as Record<string,unknown>)){
    const item=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null,config=item?.config;
    const entry=config&&typeof config==="object"&&!Array.isArray(config)?config as Record<string,unknown>:null;
    if(!entry||entry.id!==sensorId||typeof entry.displayname!=="string"||typeof entry.type!=="string"||typeof entry.unit!=="string")throw new EnterpriseClientError("SCHEMA","企業 API configs sensor 格式不符");
  }
  if(endpoint==="groups")for(const raw of value.data as unknown[]){
    const group=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
    if(!group||typeof group.groupId!=="string"||typeof group.groupAlias!=="string"||!group.sensors||typeof group.sensors!=="object"||Array.isArray(group.sensors))throw new EnterpriseClientError("SCHEMA","企業 API groups 格式不符");
  }
  return value as unknown as EnterpriseEnvelope;
}

export class EnterpriseApiClient {
  private readonly agent: Agent;

  constructor(private readonly config: EnterpriseClientConfig) {
    this.agent = new Agent({ keepAlive: true, maxSockets: 3, ...tlsAgentOptions(config) });
  }

  async get(endpoint: EnterpriseEndpoint, attemptCount = 1): Promise<EndpointSuccess> {
    const started = performance.now();
    const url = new URL(PATHS[endpoint], this.config.origin);
    const responseData = await new Promise<{body:Buffer;httpStatus:number}>((resolve, reject) => {
      const req = httpsRequest(url, {
        method: "GET",
        agent: this.agent,
        headers: { Accept: "application/json", ...authHeaders(this.config) },
      }, (response) => {
        const status = response.statusCode ?? 0;
        try{validateHttpStatus(status);}catch(error){response.resume();reject(error);return;}
        const declared = Number(response.headers["content-length"] ?? 0);
        try{assertResponseSize(declared,this.config.maxResponseBytes,status);}catch(error){response.destroy();reject(error);return;}
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > this.config.maxResponseBytes) {
            response.destroy(new EnterpriseClientError("RESPONSE_TOO_LARGE", "企業 API 回應超過大小限制", status));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({body:Buffer.concat(chunks),httpStatus:status}));
        response.on("error", reject);
      });
      req.setTimeout(this.config.timeoutMs, () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
      req.on("error", reject);
      req.end();
    }).catch((error) => {
      if (error instanceof EnterpriseClientError) throw error;
      throw classifyTransportError(error);
    });

    let decoded: unknown;
    try { decoded = JSON.parse(responseData.body.toString("utf8")); } catch { throw new EnterpriseClientError("INVALID_JSON", "企業 API 回應不是有效 JSON"); }
    const envelope = validateEnvelope(endpoint, decoded);
    const fetchedAtMs=Date.now();
    return {
      endpoint,
      envelope,
      httpStatus: responseData.httpStatus,
      fetchedAtMs,
      durationMs: Math.round(performance.now() - started),
      responseBytes: responseData.body.byteLength,
      attemptCount,
    };
  }

  close() { this.agent.destroy(); }
}
