import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../../src/lib/schema.ts";
import type { HistoryPoint } from "../../src/lib/dashboard/snapshots.ts";
import { computeVelocity } from "../../src/lib/dashboard/velocity.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

function point(date: string, shipped: number, doneUnverified = 0, storiesTracked = 20): HistoryPoint {
  return {
    date,
    generatedAt: `${date}T08:00:00.000Z`,
    kpis: {
      featuresTracked: 1,
      lightTierMilestones: 0,
      storiesTracked,
      shipped,
      doneUnverified,
      staged: 0,
      inReview: 0,
      inProgress: 0,
      blocked: 0,
      todo: storiesTracked - shipped - doneUnverified,
      blockedOrTodo: storiesTracked - shipped - doneUnverified,
    },
  };
}

/** A snapshot carrying just the one feature whose scoreBasis the velocity
 *  math reads. */
function snapshot(date: string, shipped: number, doneUnverified: number, total: number): StatusSnapshotT {
  return {
    date,
    features: [
      {
        scoreBasis: {
          shipped,
          doneUnverified,
          staged: 0,
          inReview: 0,
          inProgress: 0,
          blocked: 0,
          todo: total - shipped - doneUnverified,
          total,
        },
      },
    ],
  } as unknown as StatusSnapshotT;
}

describe("computeVelocity", () => {
  it("measures the rate across the window, not between the last two snapshots", () => {
    // 4 stories done over 4 days, regardless of how they were spaced.
    const history = [point("2026-08-10", 2), point("2026-08-12", 2), point("2026-08-14", 6)];
    const velocity = computeVelocity(history, snapshot("2026-08-14", 6, 0, 20), null)!;

    expect(velocity.perDay).toBe(1);
    expect(velocity.windowDays).toBe(4);
    expect(velocity.remaining).toBe(14);
  });

  it("counts done_unverified as done, like the header percentage does", () => {
    const history = [point("2026-08-10", 2, 0), point("2026-08-11", 2, 3)];
    const velocity = computeVelocity(history, snapshot("2026-08-11", 2, 3, 20), null)!;

    expect(velocity.done).toBe(5);
    expect(velocity.perDay).toBe(3);
  });

  it("projects a landing date and compares it to the target", () => {
    const history = [point("2026-08-10", 0), point("2026-08-20", 10)];
    // 10 done in 10 days = 1/day, 10 remaining -> lands 2026-08-30.
    const velocity = computeVelocity(history, snapshot("2026-08-20", 10, 0, 20), "2026-08-25")!;

    expect(velocity.forecastDate).toBe("2026-08-30");
    expect(velocity.daysVsTarget).toBe(5);
  });

  it("reports no forecast date rather than inventing one when nothing is finishing", () => {
    const history = [point("2026-08-10", 5), point("2026-08-14", 5)];
    const velocity = computeVelocity(history, snapshot("2026-08-14", 5, 0, 20), "2026-08-31")!;

    expect(velocity.perDay).toBe(0);
    expect(velocity.forecastDate).toBeNull();
    expect(velocity.daysVsTarget).toBeNull();
  });

  it("has nothing to measure from a single snapshot", () => {
    expect(computeVelocity([point("2026-08-14", 5)], snapshot("2026-08-14", 5, 0, 20), null)).toBeNull();
  });

  it("lands today when every story is already done", () => {
    const history = [point("2026-08-10", 0, 0, 5), point("2026-08-14", 5, 0, 5)];
    const velocity = computeVelocity(history, snapshot("2026-08-14", 5, 0, 5), "2026-08-31")!;

    expect(velocity.remaining).toBe(0);
    expect(velocity.forecastDate).toBe("2026-08-14");
    expect(velocity.daysVsTarget).toBe(-17);
  });
});
