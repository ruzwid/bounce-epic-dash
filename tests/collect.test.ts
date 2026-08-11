import { describe, expect, it, vi } from "vitest";
import { collectFeature, type Deps, type FeatureTarget } from "../scripts/collect.ts";
import type { Config } from "../src/lib/config-schema.ts";
import { makePr } from "./fixtures/prs.ts";

const NOW = new Date("2026-01-15T12:00:00.000Z");

const CONFIG: Config = {
  epic: { key: "TEST-1", title: "Test Epic", startDate: "2026-01-01", targetDate: null },
  jira: { projectKey: "TEST", statusMap: { Done: "shipped", "In Progress": "in_progress", "To Do": "todo" } },
  github: { org: "test-org" },
  timezone: "Europe/Dublin",
  scoreWeights: { shipped: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
  milestones: [],
  people: {},
};

function target(overrides: Partial<FeatureTarget> = {}): FeatureTarget {
  return {
    key: "TEST-10",
    code: "F1.1",
    owner: "alice",
    repos: ["service-a"],
    title: "F1.1",
    milestone: "M1",
    tier: "full",
    ...overrides,
  };
}

function jiraIssue(key: string, statusName: string) {
  return {
    key,
    fields: { summary: `Summary for ${key}`, status: { name: statusName }, updated: "2026-01-10T00:00:00.000+0000" },
  };
}

describe("collectFeature", () => {
  it("returns dataOk: true on a fully successful collection", async () => {
    const deps: Deps = {
      searchSubtasks: vi.fn().mockResolvedValue([jiraIssue("TEST-11", "Done")]),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: { description: null } }),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([]),
    };
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, deps);
    expect(feature.dataOk).toBe(true);
    expect(errors).toEqual([]);
    expect(feature.subtasks).toHaveLength(1);
  });

  it("marks a feature dataOk: false on JIRA failure, without throwing", async () => {
    const deps: Deps = {
      searchSubtasks: vi.fn().mockRejectedValue(new Error("JIRA is down")),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: {} }),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([]),
    };
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, deps);
    expect(feature.dataOk).toBe(false);
    expect(feature.score).toBe(0); // never a bare "0%" without dataOk=false alongside it
    expect(errors).toEqual([{ source: "jira", scope: "TEST-10", message: "JIRA is down" }]);
  });

  it("a JIRA failure on one feature does not affect collecting another feature", async () => {
    const failingDeps: Deps = {
      searchSubtasks: vi.fn().mockRejectedValue(new Error("JIRA is down")),
      getIssue: vi.fn().mockRejectedValue(new Error("JIRA is down")),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([]),
    };
    const healthyDeps: Deps = {
      searchSubtasks: vi.fn().mockResolvedValue([jiraIssue("TEST-21", "Done")]),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-20", fields: { description: null } }),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([]),
    };

    const [failed, healthy] = await Promise.all([
      collectFeature(target({ key: "TEST-10" }), CONFIG, NOW, failingDeps),
      collectFeature(target({ key: "TEST-20" }), CONFIG, NOW, healthyDeps),
    ]);

    expect(failed.feature.dataOk).toBe(false);
    expect(healthy.feature.dataOk).toBe(true);
    expect(healthy.errors).toEqual([]);
  });

  it("marks dataOk: false on a GitHub failure but still uses the JIRA data it got", async () => {
    const deps: Deps = {
      searchSubtasks: vi.fn().mockResolvedValue([jiraIssue("TEST-11", "Done")]),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: { description: null } }),
      getDefaultBranch: vi.fn().mockRejectedValue(new Error("GitHub is down")),
      getRepoPrs: vi.fn().mockResolvedValue([]),
    };
    const { feature, errors } = await collectFeature(target(), CONFIG, NOW, deps);
    expect(feature.dataOk).toBe(false);
    expect(feature.subtasks).toHaveLength(1);
    expect(feature.subtasks[0]?.key).toBe("TEST-11");
    expect(errors[0]?.source).toBe("github");
  });

  it("attributes a PR to a subtask by ticket key in the branch name, and derives shipped from it", async () => {
    const pr = makePr({
      number: 1,
      headRefName: "TEST-11-add-thing",
      baseRefName: "master",
      state: "MERGED",
      mergedAt: "2026-01-12T00:00:00.000Z",
      repo: "service-a",
    });
    const deps: Deps = {
      searchSubtasks: vi.fn().mockResolvedValue([jiraIssue("TEST-11", "In Progress")]),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: { description: null } }),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([pr]),
    };
    const { feature } = await collectFeature(target(), CONFIG, NOW, deps);
    expect(feature.subtasks[0]?.status).toBe("shipped");
    expect(feature.subtasks[0]?.prs).toHaveLength(1);
    expect(feature.subtasks[0]?.prs[0]?.shippedToDefault).toBe(true);
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
    const deps: Deps = {
      searchSubtasks: vi.fn().mockResolvedValue([jiraIssue("TEST-11", "Done")]),
      getIssue: vi.fn().mockResolvedValue({ key: "TEST-10", fields: { description: null } }),
      getDefaultBranch: vi.fn().mockResolvedValue("master"),
      getRepoPrs: vi.fn().mockResolvedValue([unrelatedStagedPr]),
    };
    const { feature } = await collectFeature(target(), CONFIG, NOW, deps);
    expect(feature.subtasks[0]?.prs).toEqual([]); // TEST-99's PR isn't attributed to TEST-11
    expect(feature.releaseGate).toBeNull(); // and must not leak into this feature's gate
  });
});
