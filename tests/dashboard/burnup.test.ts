import { describe, expect, it } from "vitest";
import { buildBurnUpSeries } from "../../src/lib/dashboard/burnup.ts";
import type { HistoryPoint } from "../../src/lib/dashboard/snapshots.ts";

const history: HistoryPoint[] = [
  {
    date: "2026-08-10",
    generatedAt: "2026-08-10T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 0, doneUnverified: 0, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 2, blockedOrTodo: 2 },
  },
  {
    date: "2026-08-11",
    generatedAt: "2026-08-11T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 1, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 2, blockedOrTodo: 2 },
  },
];

describe("buildBurnUpSeries", () => {
  it("carries shipped/doneUnverified/staged/total from each point's kpis", () => {
    const series = buildBurnUpSeries(history, "2026-08-01", null);
    expect(series).toEqual([
      { date: "2026-08-10", shipped: 0, doneUnverified: 0, staged: 1, total: 3, pace: null, projected: null, isProjection: false },
      { date: "2026-08-11", shipped: 1, doneUnverified: 0, staged: 0, total: 3, pace: null, projected: null, isProjection: false },
    ]);
  });

  it("leaves the series untouched when there is no velocity to project from", () => {
    const flat = buildBurnUpSeries(history, "2026-08-01", "2026-08-21", {
      perDay: 0,
      windowDays: 1,
      done: 1,
      total: 3,
      remaining: 2,
      forecastDate: null,
      targetDate: "2026-08-21",
      daysVsTarget: null,
    });
    expect(flat.every((p) => !p.isProjection)).toBe(true);
    expect(flat).toHaveLength(history.length);
  });

  it("projects forward from the last snapshot at the observed rate", () => {
    // 1 done now, 2 remaining, 1 story/day -> lands 2026-08-13, but the
    // series runs to the later of that and the target date.
    const series = buildBurnUpSeries(history, "2026-08-01", "2026-08-21", {
      perDay: 1,
      windowDays: 1,
      done: 1,
      total: 3,
      remaining: 2,
      forecastDate: "2026-08-13",
      targetDate: "2026-08-21",
      daysVsTarget: -8,
    });

    // The join: the last measured point carries the first projected value,
    // so the two lines meet exactly once instead of duplicating a date.
    const lastActual = series.filter((p) => !p.isProjection).at(-1)!;
    expect(lastActual.date).toBe("2026-08-11");
    expect(lastActual.projected).toBe(1);
    expect(series.filter((p) => p.date === "2026-08-11")).toHaveLength(1);

    const projected = series.filter((p) => p.isProjection);
    expect(projected.at(-1)!.date).toBe("2026-08-21");
    // Never past the scope line: 1 + 1/day for 10 days clamps at 3.
    expect(Math.max(...projected.map((p) => p.projected!))).toBe(3);
    // Projected points carry no measured counts — nothing can draw them
    // as though they were history.
    expect(projected.every((p) => p.shipped === undefined)).toBe(true);
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
