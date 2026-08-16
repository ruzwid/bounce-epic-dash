import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Feature as FeatureSchema } from "../../src/lib/schema.ts";
import { doneStories, storyTotals } from "../../src/lib/dashboard/totals.ts";

type FeatureT = z.infer<typeof FeatureSchema>;

function makeFeature(basis: Partial<FeatureT["scoreBasis"]>): FeatureT {
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
    key: "TEST-1",
    code: "F1.1",
    title: "F1.1 — A feature",
    milestone: "M1",
    tier: "full",
    owner: "Alice",
    repos: [],
    overview: "",
    stage: "underway",
    score: 50,
    scoreBasis,
    scoreOverride: null,
    confidence: "high",
    rationale: "",
    daysSinceLastActivity: 0,
    daysInStaged: null,
    releaseGate: null,
    acCoverage: [],
    callouts: [],
    stories: [],
    dataOk: true,
    signedOff: false,
    awaitingSignOff: false,
  } as unknown as FeatureT;
}

describe("storyTotals", () => {
  it("counts every status, including the in-progress one the KPI strip used to drop", () => {
    const totals = storyTotals([
      makeFeature({ shipped: 3, inProgress: 2, todo: 1, total: 6 }),
      makeFeature({ doneUnverified: 1, blocked: 1, total: 2 }),
    ]);

    expect(totals.inProgress).toBe(2);
    expect(totals.blocked).toBe(1);
    expect(totals.todo).toBe(1);
  });

  it("adds up to the tracked total — the arithmetic the old strip failed", () => {
    const totals = storyTotals([
      makeFeature({ shipped: 35, doneUnverified: 7, inReview: 12, inProgress: 3, todo: 17, total: 74 }),
    ]);

    const sum =
      totals.shipped +
      totals.doneUnverified +
      totals.staged +
      totals.inReview +
      totals.inProgress +
      totals.blocked +
      totals.todo;
    expect(sum).toBe(totals.total);
  });

  it("counts done_unverified as done — the same pair the score weights at 1.0", () => {
    expect(doneStories(storyTotals([makeFeature({ shipped: 4, doneUnverified: 2, total: 6 })]))).toBe(6);
  });

  it("is zero for no features rather than throwing", () => {
    expect(storyTotals([]).total).toBe(0);
  });
});
