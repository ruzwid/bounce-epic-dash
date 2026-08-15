import { describe, expect, it } from "vitest";
import { dashboardSearchSchema, groupMatchesMilestoneFilter, matchesFilters, needsAttention } from "../../src/lib/dashboard/search.ts";
import type { z } from "zod";
import type { Feature as FeatureSchema, PrRef as PrRefSchema } from "../../src/lib/schema.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type PrRefT = z.infer<typeof PrRefSchema>;

const NOW = new Date("2026-08-11T12:00:00.000Z");

function makePr(overrides: Partial<PrRefT> = {}): PrRefT {
  return {
    repo: "service-a",
    number: 1,
    title: "PR",
    url: "https://github.com/test-org/service-a/pull/1",
    state: "OPEN",
    isDraft: false,
    baseRef: "master",
    headRef: "branch",
    shippedToDefault: false,
    mergedAt: null,
    updatedAt: "2026-08-09T00:00:00.000Z",
    stackChain: [],
    reviewRequests: [],
    reviews: [],
    author: null,
    filesTouched: [],
    ...overrides,
  };
}

function makeFeature(overrides: Partial<FeatureT> = {}): FeatureT {
  return {
    key: "TEST-1",
    code: "F1.1",
    title: "A healthy feature",
    milestone: "M1",
    tier: "full",
    owner: "Alice",
    repos: ["service-a"],
    overview: "",
    stage: "underway",
    score: 50,
    scoreBasis: { shipped: 1, doneUnverified: 0, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 2 },
    scoreOverride: null,
    confidence: "high",
    rationale: "Going fine.",
    daysSinceLastActivity: 1,
    daysInStaged: null,
    releaseGate: null,
    acCoverage: [],
    stories: [],
    callouts: [],
    override: null,
    dataOk: true,
    signedOff: false,
    awaitingSignOff: false,
    ...overrides,
  };
}

describe("needsAttention", () => {
  it("is false for a healthy, recently-active, callout-free feature", () => {
    expect(needsAttention(makeFeature(), NOW)).toBe(false);
  });

  it("is true when scoreBasis.blocked > 0", () => {
    const feature = makeFeature({ scoreBasis: { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 } });
    expect(needsAttention(feature, NOW)).toBe(true);
  });

  it("is true when stalled more than 7 days and not done", () => {
    const feature = makeFeature({ daysSinceLastActivity: 8, stage: "underway" });
    expect(needsAttention(feature, NOW)).toBe(true);
  });

  it("is false when stalled more than 7 days but the feature is done", () => {
    const feature = makeFeature({ daysSinceLastActivity: 30, stage: "done" });
    expect(needsAttention(feature, NOW)).toBe(false);
  });

  it("is false when blocked but the feature is done (e.g. signed off with residual blocked work)", () => {
    const feature = makeFeature({
      stage: "done",
      scoreBasis: { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 },
    });
    expect(needsAttention(feature, NOW)).toBe(false);
  });

  it("is false when there's an open callout but the feature is done", () => {
    const feature = makeFeature({
      stage: "done",
      callouts: [{ type: "drift", severity: "info", message: "Product signed off despite unverified stories.", refs: [] }],
    });
    expect(needsAttention(feature, NOW)).toBe(false);
  });

  it("is true when a PR has been waiting on review for more than 2 days", () => {
    const feature = makeFeature({
      stories: [
        {
          key: "SUB-1",
          summary: "s",
          jiraStatus: "In Review",
          status: "in_review",
          assignee: "Alice",
          updatedAt: "2026-08-09T00:00:00.000Z",
          prs: [makePr({ state: "OPEN", reviewRequests: ["bob"], updatedAt: "2026-08-08T00:00:00.000Z" })],
          subtasks: [],
        },
      ],
    });
    expect(needsAttention(feature, NOW)).toBe(true);
  });

  it("is false when a PR is open for review but under 2 days", () => {
    const feature = makeFeature({
      stories: [
        {
          key: "SUB-1",
          summary: "s",
          jiraStatus: "In Review",
          status: "in_review",
          assignee: "Alice",
          updatedAt: "2026-08-11T00:00:00.000Z",
          prs: [makePr({ state: "OPEN", reviewRequests: ["bob"], updatedAt: "2026-08-11T00:00:00.000Z" })],
          subtasks: [],
        },
      ],
    });
    expect(needsAttention(feature, NOW)).toBe(false);
  });

  it("is true when there are open callouts", () => {
    const feature = makeFeature({
      callouts: [{ type: "drift", severity: "info", message: "x", refs: [] }],
    });
    expect(needsAttention(feature, NOW)).toBe(true);
  });
});

describe("matchesFilters", () => {
  const m1 = makeFeature({ milestone: "M1", owner: "Alice", title: "Excel Template", code: "F1.1", key: "BOUN-1" });
  const m3 = makeFeature({ milestone: "M3", owner: "Tony", title: "API Platform", code: "M3", key: "BOUN-2" });
  const m4 = makeFeature({ milestone: "M4", owner: "Tony", title: "Dashboard", code: "M4", key: "BOUN-3" });

  it("'all' matches every milestone", () => {
    const search = { milestone: "all" as const, engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(m1, search, NOW)).toBe(true);
    expect(matchesFilters(m3, search, NOW)).toBe(true);
    expect(matchesFilters(m4, search, NOW)).toBe(true);
  });

  it("'m1' matches only M1", () => {
    const search = { milestone: "m1" as const, engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(m1, search, NOW)).toBe(true);
    expect(matchesFilters(m3, search, NOW)).toBe(false);
  });

  it("'m3-m4' matches M3 and M4, not M1", () => {
    const search = { milestone: "m3-m4" as const, engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(m1, search, NOW)).toBe(false);
    expect(matchesFilters(m3, search, NOW)).toBe(true);
    expect(matchesFilters(m4, search, NOW)).toBe(true);
  });

  it("engineer filters by exact owner display name", () => {
    const search = { milestone: "all" as const, engineer: "Tony", needsAttention: false, q: "" };
    expect(matchesFilters(m1, search, NOW)).toBe(false);
    expect(matchesFilters(m3, search, NOW)).toBe(true);
  });

  it("q matches case-insensitively against title, code, or key", () => {
    const search = { milestone: "all" as const, engineer: null, needsAttention: false, q: "excel" };
    expect(matchesFilters(m1, search, NOW)).toBe(true);
    expect(matchesFilters(m3, search, NOW)).toBe(false);
  });

  it("needsAttention:true filters to needsAttention(feature)", () => {
    const blocked = makeFeature({ scoreBasis: { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 } });
    const search = { milestone: "all" as const, engineer: null, needsAttention: true, q: "" };
    expect(matchesFilters(blocked, search, NOW)).toBe(true);
    expect(matchesFilters(m1, search, NOW)).toBe(false);
  });

  it("combines all filters with AND", () => {
    const search = { milestone: "m1" as const, engineer: "Alice", needsAttention: false, q: "excel" };
    expect(matchesFilters(m1, search, NOW)).toBe(true);
    const wrongEngineer = { ...search, engineer: "Bob" };
    expect(matchesFilters(m1, wrongEngineer, NOW)).toBe(false);
  });
});

describe("groupMatchesMilestoneFilter", () => {
  const allFilters = { milestone: "all" as const, engineer: null, needsAttention: false, q: "" };

  it("'all' matches every group", () => {
    expect(groupMatchesMilestoneFilter(["M1"], allFilters)).toBe(true);
    expect(groupMatchesMilestoneFilter(["M3", "M4"], allFilters)).toBe(true);
  });

  it("'m1' matches only a group containing M1", () => {
    const search = { ...allFilters, milestone: "m1" as const };
    expect(groupMatchesMilestoneFilter(["M1"], search)).toBe(true);
    expect(groupMatchesMilestoneFilter(["M2"], search)).toBe(false);
    expect(groupMatchesMilestoneFilter(["M3", "M4"], search)).toBe(false);
  });

  it("'m3-m4' matches the merged group but not M1 or M2 — this is the bug fix: without it, picking a milestone left every other group rendering with an empty, filtered-out feature list instead of not rendering at all", () => {
    const search = { ...allFilters, milestone: "m3-m4" as const };
    expect(groupMatchesMilestoneFilter(["M3", "M4"], search)).toBe(true);
    expect(groupMatchesMilestoneFilter(["M1"], search)).toBe(false);
    expect(groupMatchesMilestoneFilter(["M2"], search)).toBe(false);
  });
});

describe("dashboardSearchSchema", () => {
  it("defaults to the all-features, no-filter state", () => {
    const parsed = dashboardSearchSchema.parse({});
    expect(parsed).toEqual({ milestone: "all", engineer: null, needsAttention: false, q: "" });
  });

  it("falls back to 'all' for an invalid milestone value instead of throwing", () => {
    const parsed = dashboardSearchSchema.parse({ milestone: "bogus" });
    expect(parsed.milestone).toBe("all");
  });
});
