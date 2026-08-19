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
    createdAt: null,
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

  /** An epic slug with no config of its own, so these cases exercise the
   *  groups a snapshot *publishes* without the config fallback also having
   *  an opinion. There's a separate case for that fallback below. */
  const NO_CONFIG = "fixture-epic";

  /** A snapshot carrying just enough milestone metadata to resolve the
   *  groups: M3 and M4 share `group: m3-m4` the way WPP at Scale's config
   *  sets it, M1 has none and is therefore its own group. The grouping is
   *  per-epic configuration now, so a filter test has to state it rather
   *  than rely on a hardcoded list inside the filter. */
  const snapshot = {
    epic: { slug: NO_CONFIG },
    milestones: [
      { id: "M1", key: "BOUN-100", title: "M1 — Core", tier: "full", owner: "Alice", overview: "", group: null },
      { id: "M3", key: "BOUN-300", title: "M3 — API", tier: "light", owner: "Tony", overview: "", group: "m3-m4" },
      { id: "M4", key: "BOUN-400", title: "M4 — Dash", tier: "light", owner: "Tony", overview: "", group: "m3-m4" },
    ],
    features: [m1, m3, m4],
  } as unknown as Parameters<typeof matchesFilters>[0];

  it("'all' matches every milestone", () => {
    const search = { milestone: "all", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m4, search, NOW)).toBe(true);
  });

  it("'m1' matches only M1", () => {
    const search = { milestone: "m1", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(false);
  });

  it("'m3-m4' matches both milestones sharing that group, not M1", () => {
    const search = { milestone: "m3-m4", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(false);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m4, search, NOW)).toBe(true);
  });

  it("a milestone with no group is filtered by its own id", () => {
    // The default for every milestone in an epic that sets no `group` at
    // all — the second epic's whole config, as it stands.
    const ungrouped = {
      epic: { slug: NO_CONFIG },
      milestones: [],
      features: [m1, m3],
    } as unknown as Parameters<typeof matchesFilters>[0];
    const search = { milestone: "m3", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(ungrouped, m3, search, NOW)).toBe(true);
    expect(matchesFilters(ungrouped, m1, search, NOW)).toBe(false);
  });

  it("a filter value from another epic matches nothing rather than falling back to unfiltered", () => {
    const search = { milestone: "m9", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(false);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(false);
  });

  it("falls back to the epic's current config for a snapshot written before grouping was published", () => {
    // Every snapshot committed before MilestoneSummary.group existed
    // publishes no group at all. Without this fallback, WPP at Scale's
    // M3/M4 — one owner's platform build, always read as one section —
    // would split into two the moment you opened an older date.
    const preGrouping = {
      epic: { slug: "wpp-at-scale" },
      milestones: [
        { id: "M3", key: "BOUN-11290", title: "M3", tier: "light", owner: "Tony", overview: "", group: null },
        { id: "M4", key: "BOUN-11248", title: "M4", tier: "light", owner: "Tony", overview: "", group: null },
      ],
      features: [m3, m4],
    } as unknown as Parameters<typeof matchesFilters>[0];
    const search = { milestone: "m3-m4", engineer: null, needsAttention: false, q: "" };
    expect(matchesFilters(preGrouping, m3, search, NOW)).toBe(true);
    expect(matchesFilters(preGrouping, m4, search, NOW)).toBe(true);
  });

  it("engineer filters by exact owner display name", () => {
    const search = { milestone: "all", engineer: "Tony", needsAttention: false, q: "" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(false);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(true);
  });

  it("q matches case-insensitively against title, code, or key", () => {
    const search = { milestone: "all", engineer: null, needsAttention: false, q: "excel" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m3, search, NOW)).toBe(false);
  });

  it("needsAttention:true filters to needsAttention(feature)", () => {
    const blocked = makeFeature({ scoreBasis: { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 } });
    const search = { milestone: "all", engineer: null, needsAttention: true, q: "" };
    expect(matchesFilters(snapshot, blocked, search, NOW)).toBe(true);
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(false);
  });

  it("combines all filters with AND", () => {
    const search = { milestone: "m1", engineer: "Alice", needsAttention: false, q: "excel" };
    expect(matchesFilters(snapshot, m1, search, NOW)).toBe(true);
    const wrongEngineer = { ...search, engineer: "Bob" };
    expect(matchesFilters(snapshot, m1, wrongEngineer, NOW)).toBe(false);
  });
});

describe("groupMatchesMilestoneFilter", () => {
  const allFilters = { milestone: "all", engineer: null, needsAttention: false, q: "" };

  it("'all' matches every group", () => {
    expect(groupMatchesMilestoneFilter("m1", allFilters)).toBe(true);
    expect(groupMatchesMilestoneFilter("m3-m4", allFilters)).toBe(true);
  });

  it("matches only the group whose own slug is selected", () => {
    const search = { ...allFilters, milestone: "m1" };
    expect(groupMatchesMilestoneFilter("m1", search)).toBe(true);
    expect(groupMatchesMilestoneFilter("m2", search)).toBe(false);
    expect(groupMatchesMilestoneFilter("m3-m4", search)).toBe(false);
  });

  it("'m3-m4' matches the merged group but not M1 or M2 — this is the bug fix: without it, picking a milestone left every other group rendering with an empty, filtered-out feature list instead of not rendering at all", () => {
    const search = { ...allFilters, milestone: "m3-m4" };
    expect(groupMatchesMilestoneFilter("m3-m4", search)).toBe(true);
    expect(groupMatchesMilestoneFilter("m1", search)).toBe(false);
    expect(groupMatchesMilestoneFilter("m2", search)).toBe(false);
  });
});

describe("dashboardSearchSchema", () => {
  // The validator's parameter carries TanStack's phantom SearchSchemaInput
  // marker, which exists only in the type system (it is how the function
  // tells the router that every field is optional for link-building — see
  // the note on dashboardSearchSchema). Nothing constructs one at runtime,
  // so the tests hand it a plain URL-shaped object.
  const parse = (input: Record<string, unknown>) =>
    dashboardSearchSchema(input as Parameters<typeof dashboardSearchSchema>[0]);

  it("defaults to the all-features, no-filter state", () => {
    const parsed = parse({});
    expect(parsed).toEqual({ milestone: "all", engineer: null, needsAttention: false, q: "" });
  });

  it("accepts any milestone group slug, since the valid set is per-epic", () => {
    // The schema is shared by every route across every epic, so it cannot
    // enumerate one epic's milestone groups. An unknown value is carried
    // through and simply matches nothing (see matchesFilters above) rather
    // than being silently rewritten to "all", which would show a reader
    // following a stale link the whole epic while their URL said otherwise.
    expect(parse({ milestone: "m9" }).milestone).toBe("m9");
  });

  it("falls back to 'all' for a milestone value of the wrong type instead of throwing", () => {
    expect(parse({ milestone: 7 }).milestone).toBe("all");
  });

  it("falls back on every other field of the wrong type rather than throwing", () => {
    // A hand-edited or stale-shaped URL shows the dashboard unfiltered —
    // a state the reader can see and correct — rather than an error page.
    expect(parse({ engineer: 7, needsAttention: "yes", q: [] })).toEqual({
      milestone: "all",
      engineer: null,
      needsAttention: false,
      q: "",
    });
  });

  it("reads needsAttention as a boolean or the string a hand-typed URL leaves", () => {
    expect(parse({ needsAttention: true }).needsAttention).toBe(true);
    expect(parse({ needsAttention: "true" }).needsAttention).toBe(true);
    expect(parse({ needsAttention: false }).needsAttention).toBe(false);
  });
});
