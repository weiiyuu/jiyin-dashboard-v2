import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createApiMeta, type ApiErrorResponse } from "@/shared/contracts/api-response";

export function requestId() { return randomUUID(); }

export function ok<T>(data: T, id: string, init?: ResponseInit) {
  return NextResponse.json({ data, meta: createApiMeta({ requestId: id }) }, init);
}

export function apiError(id: string, status: number, code: string, message: string) {
  const body: ApiErrorResponse = { error: { code, message, requestId: id } };
  return NextResponse.json(body, { status });
}

export function reportUnexpectedError(id:string,scope:string,error:unknown):void{
  const detail=error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error);
  console.error(`[${scope}] request failed`,{requestId:id,detail});
}
