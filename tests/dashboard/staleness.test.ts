import { describe, expect, it } from "vitest";
import { isStale } from "../../src/lib/dashboard/staleness.ts";

describe("isStale", () => {
  const generatedAt = "2026-08-11T08:00:00.000Z";

  it("is true just past 26 hours old", () => {
    const now = new Date("2026-08-12T10:01:00.000Z"); // 26h1m later
    expect(isStale(generatedAt, now)).toBe(true);
  });

  it("is false just under 26 hours old", () => {
    const now = new Date("2026-08-12T09:59:00.000Z"); // 25h59m later
    expect(isStale(generatedAt, now)).toBe(false);
  });
});
