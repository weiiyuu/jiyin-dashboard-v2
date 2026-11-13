import { describe, expect, it } from "vitest";
import { createApiMeta } from "@/shared/contracts/api-response";
import { decideLampState, determineFreshness } from "@/shared/contracts/status";

describe("shared contracts", () => {
  it("always supplies required API metadata", () => {
    expect(createApiMeta({ requestId: "req-1", generatedAt: "2026-11-14T00:00:00.000Z" })).toEqual({
      generatedAt: "2026-11-14T00:00:00.000Z",
      timezone: "Asia/Taipei",
      requestId: "req-1",
      warnings: [],
    });
  });

  it("requires provider mode and time context together", () => {
    expect(() => createApiMeta({ requestId: "req-2", providerMode: "DEMO" })).toThrow(/together/);
  });

  it("does not reinterpret all-zero or multi-color lamp data", () => {
    expect(decideLampState({ blue: 0, green: 0, red: 0, white: 0, yellow: 0 }).state).toBe("UNKNOWN");
    expect(decideLampState({ blue: 0, green: 1, red: 1, white: 0, yellow: 0 })).toMatchObject({
      state: "OTHER",
      activeColors: ["GREEN", "RED"],
    });
  });

  it("separates freshness from lamp state", () => {
    expect(determineFreshness(null, 1_000_000, 420)).toBe("NO_DATA");
    expect(determineFreshness(0, 421_000, 420)).toBe("STALE");
    expect(determineFreshness(0, 420_000, 420)).toBe("FRESH");
  });
});
