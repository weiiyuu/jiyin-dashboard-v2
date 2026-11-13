export type ProviderMode = "LIVE" | "DEMO";

export interface TimeContext {
  now: string;
  dataDate: string;
  timezone: "Asia/Taipei";
  source: "LIVE" | "SYNTHETIC" | "PRIVATE_REPLAY";
}

export interface ApiWarning {
  code: string;
  message: string;
  fields?: string[];
}

export interface CoverageMeta {
  requestedDays: number;
  daysWithActiveBatch: number;
  expectedIntervals: number;
  importedIntervals: number;
  metricEligibleIntervals: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface ApiMetaRequired {
  generatedAt: string;
  timezone: "Asia/Taipei";
  requestId: string;
  warnings: ApiWarning[];
}

type ProviderMeta =
  | { providerMode?: undefined; timeContext?: undefined }
  | { providerMode: ProviderMode; timeContext: TimeContext };

export type ApiMeta = ApiMetaRequired &
  ProviderMeta & {
    coverage?: CoverageMeta;
    pagination?: PaginationMeta;
    staleAfterSeconds?: number;
  };

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string[]>;
  };
}

export function createApiMeta(
  input: Omit<ApiMetaRequired, "generatedAt" | "timezone" | "warnings"> &
    Partial<Pick<ApiMetaRequired, "generatedAt" | "warnings">> &
    Partial<Omit<ApiMeta, keyof ApiMetaRequired>>,
): ApiMeta {
  if ((input.providerMode === undefined) !== (input.timeContext === undefined)) {
    throw new Error("providerMode and timeContext must be provided together");
  }
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    timezone: "Asia/Taipei",
    requestId: input.requestId,
    warnings: input.warnings ?? [],
    ...(input.providerMode === undefined
      ? {}
      : { providerMode: input.providerMode, timeContext: input.timeContext! }),
    ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
    ...(input.pagination === undefined ? {} : { pagination: input.pagination }),
    ...(input.staleAfterSeconds === undefined ? {} : { staleAfterSeconds: input.staleAfterSeconds }),
  } as ApiMeta;
}
