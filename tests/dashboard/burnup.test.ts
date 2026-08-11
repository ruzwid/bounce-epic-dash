import { describe, expect, it } from "vitest";
import { buildBurnUpSeries } from "../../src/lib/dashboard/burnup.ts";
import type { HistoryPoint } from "../../src/lib/dashboard/snapshots.ts";

const history: HistoryPoint[] = [
  {
    date: "2026-08-10",
    generatedAt: "2026-08-10T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, subtasksTracked: 3, shipped: 0, staged: 1, inReview: 0, blockedOrTodo: 2 },
  },
  {
    date: "2026-08-11",
    generatedAt: "2026-08-11T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, subtasksTracked: 3, shipped: 1, staged: 0, inReview: 0, blockedOrTodo: 2 },
  },
];

describe("buildBurnUpSeries", () => {
  it("carries shipped/staged/total from each point's kpis", () => {
    const series = buildBurnUpSeries(history, "2026-08-01", null);
    expect(series).toEqual([
      { date: "2026-08-10", shipped: 0, staged: 1, total: 3, pace: null },
      { date: "2026-08-11", shipped: 1, staged: 0, total: 3, pace: null },
    ]);
  });

  it("computes a straight-line pace from startDate to targetDate when a target is set", () => {
    // start 2026-08-01, target 2026-08-21 (20 days), total scope = 3 (final point).
    const series = buildBurnUpSeries(history, "2026-08-01", "2026-08-21");
    // 2026-08-10 is 9/20 of the way -> 3 * 0.45 = 1.35 -> rounds to 1.
    expect(series[0]!.pace).toBe(1);
    // 2026-08-11 is 10/20 of the way -> 3 * 0.5 = 1.5 -> rounds to 2.
    expect(series[1]!.pace).toBe(2);
  });

  it("clamps pace to the total once past the target date", () => {
    const series = buildBurnUpSeries(history, "2026-08-01", "2026-08-05");
    expect(series[0]!.pace).toBe(3);
    expect(series[1]!.pace).toBe(3);
  });

  it("returns an empty array for an empty history", () => {
    expect(buildBurnUpSeries([], "2026-08-01", "2026-08-21")).toEqual([]);
  });
});
