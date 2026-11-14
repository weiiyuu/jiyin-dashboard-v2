import { describe, expect, it } from "vitest";
import { assertLocalMutation, importErrorResponse } from "@/server/http/local-mutation";

describe("local write request boundary",()=>{
  it("accepts only same-origin localhost mutations",()=>{
    expect(()=>assertLocalMutation(new Request("http://localhost:3000/api/imports/preview",{method:"POST",headers:{origin:"http://localhost:3000","sec-fetch-site":"same-origin"}}))).not.toThrow();
    expect(()=>assertLocalMutation(new Request("http://127.0.0.1:3000/api/imports/preview",{method:"POST",headers:{origin:"http://127.0.0.1:3000"}}))).not.toThrow();
    expect(()=>assertLocalMutation(new Request("http://0.0.0.0:3000/api/imports/preview",{method:"POST",headers:{host:"localhost:3000",origin:"http://localhost:3000","sec-fetch-site":"same-origin"}}))).not.toThrow();
    expect(()=>assertLocalMutation(new Request("http://localhost:3000/api/imports/preview",{method:"POST"}))).toThrow("ORIGIN_REQUIRED");
    expect(()=>assertLocalMutation(new Request("http://localhost:3000/api/imports/preview",{method:"POST",headers:{origin:"https://evil.example"}}))).toThrow("ORIGIN_NOT_ALLOWED");
    expect(()=>assertLocalMutation(new Request("http://0.0.0.0:3000/api/imports/preview",{method:"POST",headers:{host:"dashboard.internal",origin:"http://dashboard.internal"}}))).toThrow("LOCALHOST_REQUIRED");
    expect(()=>assertLocalMutation(new Request("http://dashboard.internal/api/imports/preview",{method:"POST",headers:{host:"localhost",origin:"http://localhost"}}))).toThrow("LOCALHOST_REQUIRED");
    expect(()=>assertLocalMutation(new Request("http://dashboard.internal/api/imports/preview",{method:"POST",headers:{origin:"http://dashboard.internal"}}))).toThrow("LOCALHOST_REQUIRED");
  });

  it("maps internal failures to stable safe public errors",()=>{
    expect(importErrorResponse(new Error("ACTIVE_VERSION_CHANGED"))).toEqual({status:409,code:"ACTIVE_VERSION_CHANGED",message:"目前啟用版本已變更，請重新預覽"});
    expect(importErrorResponse(new Error("SQLITE_CONSTRAINT secret/table/path"))).toEqual({status:500,code:"IMPORT_INTERNAL_ERROR",message:"匯入處理失敗，請使用 request ID 查詢紀錄"});
  });
});
