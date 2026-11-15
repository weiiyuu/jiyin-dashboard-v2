export const ENTERPRISE_ENDPOINTS = ["values", "configs", "groups"] as const;
export type EnterpriseEndpoint = (typeof ENTERPRISE_ENDPOINTS)[number];

export interface EnterpriseEnvelope<T = unknown> {
  apiType: string;
  apiVersion: string;
  data: T;
  localTime: string;
  responseCode: string;
  responseMsg: string;
  responseTime: string;
  thingAlias: string;
  thingName: string;
  updateTime?: string;
}

export type EnterpriseErrorCode =
  | "CONFIG"
  | "TLS_CERTIFICATE"
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_STATUS"
  | "REDIRECT"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON"
  | "API_RESPONSE"
  | "SCHEMA";

export class EnterpriseClientError extends Error {
  constructor(
    public readonly code: EnterpriseErrorCode,
    message: string,
    public readonly httpStatus: number | null = null,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "EnterpriseClientError";
  }
}

export interface EndpointSuccess<T = unknown> {
  endpoint: EnterpriseEndpoint;
  envelope: EnterpriseEnvelope<T>;
  httpStatus: number;
  fetchedAtMs: number;
  durationMs: number;
  responseBytes: number;
  attemptCount: number;
}

export interface EndpointFailure {
  endpoint: EnterpriseEndpoint;
  error: EnterpriseClientError;
  completedAtMs: number;
  durationMs: number;
  attemptCount: number;
}

export type EndpointResult<T = unknown> = EndpointSuccess<T> | EndpointFailure;

export function isEndpointSuccess<T>(result: EndpointResult<T>): result is EndpointSuccess<T> {
  return "envelope" in result;
}
