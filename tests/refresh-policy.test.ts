import { describe, expect, it } from "vitest";
import { LOCAL_REFRESH_INTERVAL_MS } from "@/components/use-local-refresh";

describe("local refresh policy", () => {
  it("uses the approved 30 second interval", () => {
    expect(LOCAL_REFRESH_INTERVAL_MS).toBe(30_000);
  });
});
