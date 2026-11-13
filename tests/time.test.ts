import { describe, expect, it } from "vitest";
import { intervalBounds, parseTaipeiIntervalEnd, taipeiDateAt } from "@/shared/time/taipei";

describe("Taipei time contract", () => {
  it("keeps 24:00 on the source date while resolving to next midnight", () => {
    const end = parseTaipeiIntervalEnd("2025-06-01", "24:00");
    expect(new Date(end).toISOString()).toBe("2025-06-01T16:00:00.000Z");
    expect(taipeiDateAt(end)).toBe("2025-06-02");
    expect(intervalBounds("2025-06-01", "24:00").intervalEndMs - intervalBounds("2025-06-01", "24:00").intervalStartMs).toBe(180_000);
  });

  it("rejects invalid labels", () => {
    expect(() => parseTaipeiIntervalEnd("2025-06-01", "24:01")).toThrow();
  });
});
