import { describe, expect, it, vi } from "vitest";
import {
  buildPrIndex,
  collectFeature,
  mentionsTicket,
  rollUpStoryStatus,
  type Deps,
  type FeatureTarget,
  type PrIndex,
} from "../scripts/collect.ts";
import type { RawPr } from "../src/lib/classify.ts";
import type { Config } from "../src/lib/config-schema.ts";
import { makePr } from "./fixtures/prs.ts";

const NOW = new Date("2026-01-15T12:00:00.000Z");

const CONFIG: Config = {
  epic: { key: "TEST-1", title: "Test Epic", startDate: "2026-01-01", targetDate: null },
  jira: {
    projectKey: "TEST",
    statusMap: { Done: "shipped", "Code Review": "in_review", "In Progress": "in_progress", "To Do": "todo" },
  },
  github: { org: "test-org", excludeRepos: [], includeRepos: [] },
  timezone: "Europe/Dublin",
  scoreWeights: { shipped: 1, done_unverified: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
  milestones: [],
  people: {},
  jiraAssignees: {},
  peopleColors: {},
};

function target(overrides: Partial<FeatureTarget> = {}): FeatureTarget {
  return {
    key: "TEST-10",
    code: "F1.1",
    owner: "alice",
    title: "F1.1",
    milestone: "M1",
    tier: "full",
    ...overrides,
  };
}

/** A PR index as buildPrIndex would produce it, for testing collectFeature
 *  in isolation from the fetching. */
function index(prs: RawPr[], defaultBranch = "master"): PrIndex {
  const prsByRepo: Record<string, RawPr[]> = {};
  const defaultBranchByRepo: Record<string, string> = {};
  for (const pr of prs) {
    (prsByRepo[pr.repo] ??= []).push(pr);
    defaultBranchByRepo[pr.repo] = defaultBranch;
  }
  return { allPrs: prs, prsByRepo, defaultBranchByRepo, degraded: false };
}

function jiraIssue(key: string, statusName: string) {
  return {
    key,
    fields: { summary: `Summary for ${key}`, status: { name: statusName }, updated: "2026-01-10T00:00:00.000+0000" },
  };
}

/** Key-aware children mock: parent key -> its child issues. Anything not
 *  listed has none, which is what a real Sub-task returns — collectFeature
 *  now walks two levels, so a flat mockResolvedValue would make every story
 *  its own sub-task. */
function childrenBy(map: Record<string, ReturnType<typeof jiraIssue>[]>) {
  return vi.fn(async (parentKey: string) => map[parentKey] ?? []);
}

function deps(overrides: Partial<Deps> = {}): Deps {
  return {
    searchChildren: childrenBy({ "TEST-10": [jiraIssue("TEST-11", "Done")] }),
    getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: { description: null } }),
    getDefaultBranch: vi.fn().mockResolvedValue("master"),
    getRepoPrs: vi.fn().mockResolvedValue([]),
    listOrgRepos: vi.fn().mockResolvedValue([{ name: "service-a", defaultBranch: "master" }]),
    ...overrides,
  };
}

describe("mentionsTicket", () => {
  it("matches a key on a word boundary in a branch name or title", () => {
    expect(mentionsTicket("TEST-11-add-thing", "TEST-11")).toBe(true);
    expect(mentionsTicket("[TEST-11] Add thing", "TEST-11")).toBe(true);
    expect(mentionsTicket("TEST-11", "TEST-11")).toBe(true);
    expect(mentionsTicket("feat/TEST-11", "TEST-11")).toBe(true);
  });

  it("does not match a longer key that merely starts with it", () => {
    // The bug this guards: searching every repo in the org makes a
    // substring match a real way to steal another ticket's PR.
    expect(mentionsTicket("TEST-110-other-work", "TEST-11")).toBe(false);
    expect(mentionsTicket("[TEST-1123] Something", "TEST-11")).toBe(false);
  });

  it("does not match a key embedded in a longer word", () => {
    expect(mentionsTicket("XTEST-11-thing", "TEST-11")).toBe(false);
  });
});

describe("buildPrIndex", () => {
  it("fetches each discovered repo exactly once, however many features exist", async () => {
    const getRepoPrs = vi.fn().mockResolvedValue([]);
    const d = deps({
      getRepoPrs,
      listOrgRepos: vi.fn().mockResolvedValue([
        { name: "service-a", defaultBranch: "master" },
        { name: "service-b", defaultBranch: "main" },
      ]),
    });

    const { index: built, errors } = await buildPrIndex(CONFIG, d);

    expect(getRepoPrs).toHaveBeenCalledTimes(2);
    expect(built.defaultBranchByRepo).toEqual({ "service-a": "master", "service-b": "main" });
    expect(built.degraded).toBe(false);
    expect(errors).toEqual([]);
  });

  it("records an unreachable repo and keeps the rest of the run", async () => {
    const d = deps({
      listOrgRepos: vi.fn().mockResolvedValue([
        { name: "service-a", defaultBranch: "master" },
        { name: "broken", defaultBranch: "master" },
      ]),
      getRepoPrs: vi.fn().mockImplementation((_org: string, repo: string) =>
        repo === "broken" ? Promise.reject(new Error("502")) : Promise.resolve([makePr({ number: 1, repo })]),
      ),
    });

    const { index: built, errors } = await buildPrIndex(CONFIG, d);

    expect(built.allPrs).toHaveLength(1);
    expect(built.degraded).toBe(false);
    expect(errors).toEqual([{ source: "github", scope: "test-org/broken", message: "502" }]);
  });

  it("marks the index degraded when repo discovery itself fails", async () => {
    const d = deps({ listOrgRepos: vi.fn().mockRejectedValue(new Error("GitHub is down")) });

    const { index: built, errors } = await buildPrIndex(CONFIG, d);

    expect(built.degraded).toBe(true);
    expect(errors[0]?.source).toBe("github");
    expect(errors[0]?.message).toMatch(/Repo discovery failed/);
  });

  it("honours excludeRepos and includeRepos", async () => {
    const getRepoPrs = vi.fn().mockResolvedValue([]);
    const d = deps({
      getRepoPrs,
      listOrgRepos: vi.fn().mockResolvedValue([
        { name: "service-a", defaultBranch: "master" },
        { name: "noisy-infra", defaultBranch: "master" },
      ]),
    });
    const config: Config = {
      ...CONFIG,
      github: { org: "test-org", excludeRepos: ["noisy-infra"], includeRepos: ["dormant-repo"] },
    };

    await buildPrIndex(config, d);

    const crawled = getRepoPrs.mock.calls.map((call) => call[1]).sort();
    expect(crawled).toEqual(["dormant-repo", "service-a"]);
  });
});

describe("collectFeature", () => {
  it("returns dataOk: true on a fully successful collection", async () => {
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, deps(), index([]));
    expect(feature.dataOk).toBe(true);
    expect(errors).toEqual([]);
    expect(feature.stories).toHaveLength(1);
  });

  it("marks a feature dataOk: false on JIRA failure, without throwing", async () => {
    const d = deps({ searchChildren: vi.fn().mockRejectedValue(new Error("JIRA is down")) });
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, d, index([]));
    expect(feature.dataOk).toBe(false);
    expect(feature.score).toBe(0); // never a bare "0%" without dataOk=false alongside it
    expect(errors).toEqual([{ source: "jira", scope: "TEST-10", message: "JIRA is down" }]);
  });

  it("a JIRA failure on one feature does not affect collecting another feature", async () => {
    const failingDeps = deps({
      searchChildren: vi.fn().mockRejectedValue(new Error("JIRA is down")),
      getIssue: vi.fn().mockRejectedValue(new Error("JIRA is down")),
    });
    const healthyDeps = deps({
      searchChildren: childrenBy({ "TEST-20": [jiraIssue("TEST-21", "Done")] }),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-20", fields: { description: null } }),
    });

    const [failed, healthy] = await Promise.all([
      collectFeature(target({ key: "TEST-10" }), CONFIG, NOW, failingDeps, index([])),
      collectFeature(target({ key: "TEST-20" }), CONFIG, NOW, healthyDeps, index([])),
    ]);

    expect(failed.feature.dataOk).toBe(false);
    expect(healthy.feature.dataOk).toBe(true);
    expect(healthy.errors).toEqual([]);
  });

  it("marks dataOk: false against a degraded index but still uses the JIRA data it got", async () => {
    const degraded: PrIndex = { allPrs: [], prsByRepo: {}, defaultBranchByRepo: {}, degraded: true };
    const { feature } = await collectFeature(target(), CONFIG, NOW, deps(), degraded);
    expect(feature.dataOk).toBe(false);
    expect(feature.stories).toHaveLength(1);
    expect(feature.stories[0]?.key).toBe("TEST-11");
  });

  it("attributes a PR to a story by ticket key in the branch name, and derives shipped from it", async () => {
    const pr = makePr({
      number: 1,
      headRefName: "TEST-11-add-thing",
      baseRefName: "master",
      state: "MERGED",
      mergedAt: "2026-01-12T00:00:00.000Z",
      repo: "service-a",
    });
    const d = deps({ searchChildren: childrenBy({ "TEST-10": [jiraIssue("TEST-11", "In Progress")] }) });
    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([pr]));
    expect(feature.stories[0]?.status).toBe("shipped");
    expect(feature.stories[0]?.prs).toHaveLength(1);
    expect(feature.stories[0]?.prs[0]?.shippedToDefault).toBe(true);
  });

  it("attributes PRs from every repo the ticket's work landed in, not one declared repo", async () => {
    // The regression this guards: repo scope used to be declared per
    // feature in config.yaml, so a story whose work spanned a UI repo,
    // its API and a shared types package only ever showed the one PR from
    // the declared repo. Two thirds of this epic's PRs were invisible.
    const prs = [
      makePr({ number: 1, headRefName: "TEST-11-ui", repo: "dashboard", state: "MERGED", baseRefName: "master", mergedAt: "2026-01-12T00:00:00.000Z" }),
      makePr({ number: 2, headRefName: "TEST-11-api", repo: "dashboard-api", state: "MERGED", baseRefName: "master", mergedAt: "2026-01-12T00:00:00.000Z" }),
      makePr({ number: 3, title: "[TEST-11] shared types", headRefName: "types-bump", repo: "ts-types", state: "OPEN" }),
    ];
    const d = deps({ searchChildren: childrenBy({ "TEST-10": [jiraIssue("TEST-11", "In Progress")] }) });

    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index(prs));

    expect(feature.stories[0]?.prs.map((p) => `${p.repo}#${p.number}`)).toEqual([
      "dashboard#1",
      "dashboard-api#2",
      "ts-types#3",
    ]);
    // repos are derived from where the work actually is, never declared
    expect(feature.repos).toEqual(["dashboard", "dashboard-api", "ts-types"]);
  });

  it("does not leak another feature's staged PR (same shared repo) into this feature's release gate", async () => {
    // TEST-11 belongs to THIS feature and has nothing staged. TEST-99's PR
    // lives in the same shared repo but belongs to an unrelated ticket —
    // it must not make this feature look like it has a release gate.
    const unrelatedStagedPr = makePr({
      number: 50,
      headRefName: "TEST-99-something-else",
      baseRefName: "integration/other-team",
      state: "MERGED",
      mergedAt: "2026-01-05T00:00:00.000Z",
      repo: "service-a",
    });
    const { feature } = await collectFeature(target(), CONFIG, NOW, deps(), index([unrelatedStagedPr]));
    expect(feature.stories[0]?.prs).toEqual([]); // TEST-99's PR isn't attributed to TEST-11
    expect(feature.releaseGate).toBeNull(); // and must not leak into this feature's gate
  });

  it("falls back to the parent ticket's own status when it has no stories yet", async () => {
    // A feature ticket sitting in "Code Review" with zero stories created
    // must not silently read as not_started/score 0.
    const d = deps({
      searchChildren: childrenBy({}),
      getIssue: vi.fn().mockResolvedValue({
        key: "TEST-10",
        fields: { summary: "The feature itself", description: null, status: { name: "In Progress" } },
      }),
    });
    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([]));
    expect(feature.stories).toHaveLength(1);
    expect(feature.stories[0]?.key).toBe("TEST-10");
    expect(feature.stories[0]?.status).toBe("in_progress");
    expect(feature.score).toBeGreaterThan(0);
  });

  it("collects a story's sub-tasks and attributes their PRs to them", async () => {
    // The regression this guards: only one level below the Feature was ever
    // fetched, so Sub-tasks — and every PR whose branch carried a sub-task
    // key — were invisible. 15 sub-tasks and 9 real PRs were being dropped.
    const pr = makePr({ number: 7, headRefName: "TEST-111-work", repo: "service-a", state: "OPEN" });
    const d = deps({
      searchChildren: childrenBy({
        "TEST-10": [jiraIssue("TEST-11", "Code Review")],
        "TEST-11": [jiraIssue("TEST-111", "Code Review")],
      }),
    });

    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([pr]));

    const story = feature.stories[0]!;
    expect(story.subtasks.map((s) => s.key)).toEqual(["TEST-111"]);
    expect(story.subtasks[0]?.prs.map((p) => `${p.repo}#${p.number}`)).toEqual(["service-a#7"]);
    // The PR belongs to the sub-task, so it is NOT duplicated onto the story.
    expect(story.prs).toEqual([]);
    // ...but the feature's repo list is still derived from it.
    expect(feature.repos).toEqual(["service-a"]);
  });

  it("a story with no PRs of its own still reads as in review when a sub-task has an open one", async () => {
    // BOUN-11441 in the real epic: zero PRs of its own, two open sub-task
    // PRs, and the Reviews page therefore claimed "no pull request is open".
    const pr = makePr({ number: 23, headRefName: "TEST-111-port", repo: "service-a", state: "OPEN" });
    const d = deps({
      searchChildren: childrenBy({
        "TEST-10": [jiraIssue("TEST-11", "Code Review")],
        "TEST-11": [jiraIssue("TEST-111", "Code Review")],
      }),
    });

    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([pr]));
    expect(feature.stories[0]?.status).toBe("in_review");
  });

  it("keeps collecting a story when its sub-task fetch fails, recording the error", async () => {
    const searchChildren = vi.fn(async (parentKey: string) => {
      if (parentKey === "TEST-10") return [jiraIssue("TEST-11", "Done")];
      throw new Error("JIRA is down");
    });
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, deps({ searchChildren }), index([]));

    expect(feature.dataOk).toBe(true);
    expect(feature.stories[0]?.subtasks).toEqual([]);
    expect(errors).toEqual([
      { source: "jira", scope: "TEST-11", message: "Sub-task fetch failed: JIRA is down" },
    ]);
  });
});

describe("rollUpStoryStatus", () => {
  it("leaves a story with no sub-tasks exactly as its own evidence found it", () => {
    expect(rollUpStoryStatus("in_progress", [])).toBe("in_progress");
  });

  it("raises to shipped only when every sub-task shipped", () => {
    expect(rollUpStoryStatus("in_progress", [{ status: "shipped" }, { status: "shipped" }])).toBe("shipped");
  });

  it("will not let one shipped sub-task declare the whole story shipped", () => {
    // The over-claim this dashboard exists to catch: deriveWorkStatus
    // returns "shipped" for ANY shipped PR, so a flat union of a story's
    // sub-task PRs would mark a barely-started story as done.
    expect(rollUpStoryStatus("todo", [{ status: "shipped" }, { status: "todo" }])).toBe("in_review");
  });

  it("raises a story with live sub-task work to in_review", () => {
    expect(rollUpStoryStatus("todo", [{ status: "in_review" }, { status: "todo" }])).toBe("in_review");
    expect(rollUpStoryStatus("todo", [{ status: "staged" }])).toBe("in_review");
  });

  it("never lowers a status, and never raises past what its own evidence proved", () => {
    expect(rollUpStoryStatus("shipped", [{ status: "todo" }])).toBe("shipped");
    expect(rollUpStoryStatus("staged", [{ status: "in_review" }])).toBe("staged");
    expect(rollUpStoryStatus("todo", [{ status: "todo" }])).toBe("todo");
  });
});
