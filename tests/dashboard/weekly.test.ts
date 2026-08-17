import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../../src/lib/schema.ts";
import { buildWeeklySummary, untouchedAllWeek, weekTotals } from "../../src/lib/dashboard/weekly.ts";

/** The epic these fixtures belong to. loadSnapshot() stamps this on every
 *  snapshot it returns (the directory a snapshot lives in is what says
 *  which epic it is), and the derivations under test read it to find that
 *  epic's people map and score weights — so a hand-built snapshot has to
 *  carry it too. */
const EPIC = "wpp-at-scale";


type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

function feature(key: string, basis: Record<string, number>, extra: Record<string, unknown> = {}) {
  const scoreBasis = {
    shipped: 0,
    doneUnverified: 0,
    staged: 0,
    inReview: 0,
    inProgress: 0,
    blocked: 0,
    todo: 0,
    total: 0,
    ...basis,
  };
  return {
    key,
    code: key,
    title: key,
    owner: "Alice",
    stage: "underway",
    daysSinceLastActivity: 0,
    scoreBasis,
    stories: [],
    ...extra,
  };
}

function snapshot(date: string, features: ReturnType<typeof feature>[]): StatusSnapshotT {
  return { date, epic: { title: "An Epic", slug: EPIC }, features } as unknown as StatusSnapshotT;
}

describe("weekTotals", () => {
  const past = snapshot("2026-08-07", [feature("F1", { shipped: 4, todo: 6, total: 10 })]);
  const current = snapshot("2026-08-14", [feature("F1", { shipped: 9, doneUnverified: 2, todo: 9, total: 20 })]);

  it("diffs the two ends of the window rather than summing days", () => {
    const totals = weekTotals(current, past);
    expect(totals.days).toBe(7);
    expect(totals.shipped).toBe(5);
    expect(totals.done).toBe(7);
    expect(totals.stories).toBe(10);
  });

  it("reports a shipped count that went backwards instead of clamping at zero", () => {
    const regressed = snapshot("2026-08-14", [feature("F1", { shipped: 2, todo: 8, total: 10 })]);
    expect(weekTotals(regressed, past).shipped).toBe(-2);
  });

  it("uses the same weighted percentage as the epic header, not a raw done/total", () => {
    // 9 shipped + 2 done_unverified of 20 stories is 55% raw; weighted by
    // config.yaml (todo scores 0) it is the same here, and the point is
    // that both ends are measured the same way.
    const totals = weekTotals(current, past);
    expect(totals.percentFrom).toBe(40);
    expect(totals.percentTo).toBe(55);
  });
});

describe("untouchedAllWeek", () => {
  it("catches only what has been quiet for the whole window", () => {
    const current = snapshot("2026-08-14", [
      feature("F1", { total: 1 }, { daysSinceLastActivity: 9 }),
      feature("F2", { total: 1 }, { daysSinceLastActivity: 2 }),
      feature("F3", { total: 1 }, { daysSinceLastActivity: null }),
    ]);
    expect(untouchedAllWeek(current, 7).map((f) => f.key)).toEqual(["F1"]);
  });

  it("leaves finished features alone — a done feature is meant to be quiet", () => {
    const current = snapshot("2026-08-14", [
      feature("F1", { total: 1 }, { daysSinceLastActivity: 30, stage: "done" }),
    ]);
    expect(untouchedAllWeek(current, 7)).toEqual([]);
  });

  it("sorts the longest silence first", () => {
    const current = snapshot("2026-08-14", [
      feature("F1", { total: 1 }, { daysSinceLastActivity: 9 }),
      feature("F2", { total: 1 }, { daysSinceLastActivity: 21 }),
    ]);
    expect(untouchedAllWeek(current, 7).map((f) => f.key)).toEqual(["F2", "F1"]);
  });
});

describe("buildWeeklySummary", () => {
  const past = snapshot("2026-08-07", [feature("F1", { shipped: 4, todo: 6, total: 10 })]);
  const current = snapshot("2026-08-14", [feature("F1", { shipped: 9, doneUnverified: 2, todo: 9, total: 20 })]);

  it("writes the week as pasteable markdown", () => {
    const totals = weekTotals(current, past);
    const text = buildWeeklySummary(current, totals, [], []);

    expect(text).toContain("## An Epic — week to 2026-08-14");
    expect(text).toContain("5 stories shipped to master");
    expect(text).toContain("+10 stories");
  });

  it("says so when nothing shipped, rather than printing an empty heading", () => {
    const flat = snapshot("2026-08-14", [feature("F1", { shipped: 4, todo: 6, total: 10 })]);
    const text = buildWeeklySummary(flat, weekTotals(flat, past), [], []);
    expect(text).toContain("Nothing shipped this week.");
  });

  it("keeps a negative shipping week in the summary instead of dropping it", () => {
    const regressed = snapshot("2026-08-14", [feature("F1", { shipped: 2, todo: 8, total: 10 })]);
    const text = buildWeeklySummary(regressed, weekTotals(regressed, past), [], []);
    expect(text).toContain("2 stories left the shipped count");
  });
});
