import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StatusSnapshot } from "../src/lib/schema.ts";
import { buildSnapshot, runMerge, validateJudgment, type MergeDeps } from "../scripts/merge.ts";
import type { PendingFile, RawFeature, RawFile } from "../scripts/collect.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")) as T;
}

const PENDING = loadFixture<PendingFile>("pending.sample.json");
const VALID_JUDGMENT = loadFixture<unknown>("judgment.valid.json");
const INVENTED_KEY_JUDGMENT = loadFixture<unknown>("judgment.invented-key.json");

describe("validateJudgment", () => {
  it("accepts a fully valid judgment file", () => {
    const result = validateJudgment(VALID_JUDGMENT, PENDING);
    expect(result.ok).toBe(true);
  });

  it("rejects unparseable/schema-invalid input", () => {
    const result = validateJudgment({ not: "a judgment" }, PENDING);
    expect(result.ok).toBe(false);
  });

  it("rejects a featureKey not present in that day's pending file (invented reference)", () => {
    const result = validateJudgment(INVENTED_KEY_JUDGMENT, PENDING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/TEST-999/);
  });

  it("rejects an acCoverage id not present in that feature's pending AC bullets", () => {
    const bad = structuredClone(VALID_JUDGMENT) as any;
    bad.features[0].acCoverage[0].id = "ac-999";
    const result = validateJudgment(bad, PENDING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ac-999/);
  });

  it("rejects a callout ref that isn't a real subtask key or PR ref for that feature", () => {
    const bad = structuredClone(VALID_JUDGMENT) as any;
    bad.features[0].callouts[0].refs = ["TEST-99999"];
    const result = validateJudgment(bad, PENDING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/TEST-99999/);
  });

  it("rejects a scoreOverride with no reason", () => {
    const bad = structuredClone(VALID_JUDGMENT) as any;
    bad.features[0].scoreOverride = { value: 85, reason: "" };
    const result = validateJudgment(bad, PENDING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reason/i);
  });

  it("rejects a scoreOverride that deviates more than 20 points from the computed score", () => {
    // pending score for TEST-10 is 80; 80 -> 40 is a 40pt swing.
    const bad = structuredClone(VALID_JUDGMENT) as any;
    bad.features[0].scoreOverride = { value: 40, reason: "Actually mostly broken in practice." };
    const result = validateJudgment(bad, PENDING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/20/);
  });

  it("accepts a scoreOverride within 20 points with a reason", () => {
    const ok = structuredClone(VALID_JUDGMENT) as any;
    ok.features[0].scoreOverride = { value: 65, reason: "Staged subtask has been stuck for weeks." };
    const result = validateJudgment(ok, PENDING);
    expect(result.ok).toBe(true);
  });
});

function makeRawFeature(overrides: Partial<RawFeature> = {}): RawFeature {
  return {
    key: "TEST-10",
    code: "F1.1",
    title: "Do the thing",
    milestone: "M1",
    tier: "full",
    owner: "alice",
    repos: ["service-a"],
    score: 80,
    scoreBasis: { shipped: 3, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 4 },
    stage: "nearly_done",
    daysSinceLastActivity: 2,
    daysInStaged: 5,
    releaseGate: {
      integrationBranch: "integration/wpp",
      status: "open",
      pr: {
        repo: "service-a",
        number: 5,
        title: "Release: wpp integration",
        url: "https://github.com/test-org/service-a/pull/5",
        state: "OPEN",
        isDraft: false,
        baseRef: "master",
        headRef: "integration/wpp",
        shippedToDefault: false,
        mergedAt: null,
        updatedAt: "2026-01-14T00:00:00.000Z",
        stackChain: [],
        reviewRequests: [],
        filesTouched: ["should-never-appear-in-a-snapshot.ts"],
      },
    },
    acBullets: [{ id: "ac-1", text: "Users can do X" }, { id: "ac-2", text: "Users can do Y" }],
    subtasks: [
      {
        key: "TEST-11",
        summary: "Sub A",
        jiraStatus: "Done",
        status: "shipped",
        assignee: "Alice",
        updatedAt: "2026-01-13T00:00:00.000Z",
        prs: [
          {
            repo: "service-a",
            number: 1,
            title: "[TEST-11] add thing",
            url: "https://github.com/test-org/service-a/pull/1",
            state: "MERGED",
            isDraft: false,
            baseRef: "master",
            headRef: "TEST-11-add-thing",
            shippedToDefault: true,
            mergedAt: "2026-01-12T00:00:00.000Z",
            updatedAt: "2026-01-12T00:00:00.000Z",
            stackChain: [],
            reviewRequests: [],
            filesTouched: ["also-should-never-appear.ts"],
          },
        ],
      },
      {
        key: "TEST-12",
        summary: "Sub B",
        jiraStatus: "In Progress",
        status: "staged",
        assignee: "Alice",
        updatedAt: "2026-01-10T00:00:00.000Z",
        prs: [],
      },
    ],
    dataOk: true,
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  const rawFeatures = [makeRawFeature()];
  const judgment = validateJudgment(VALID_JUDGMENT, PENDING);
  if (!judgment.ok) throw new Error("fixture judgment should validate");

  it("produces a StatusSnapshot-schema-valid object", () => {
    const snapshot = buildSnapshot({
      date: "2026-01-15",
      epic: { key: "TEST-1", title: "Test Epic", targetDate: null },
      rawFeatures,
      judgment: judgment.value,
      overrides: {},
      now: new Date("2026-01-15T12:00:00.000Z"),
      timezone: "Europe/Dublin",
      collectionErrors: [],
      people: { alice: "Alice" },
    });
    expect(() => StatusSnapshot.parse(snapshot)).not.toThrow();
  });

  it("never includes file paths anywhere in the snapshot (publication-safe)", () => {
    const snapshot = buildSnapshot({
      date: "2026-01-15",
      epic: { key: "TEST-1", title: "Test Epic", targetDate: null },
      rawFeatures,
      judgment: judgment.value,
      overrides: {},
      now: new Date("2026-01-15T12:00:00.000Z"),
      timezone: "Europe/Dublin",
      collectionErrors: [],
      people: { alice: "Alice" },
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/should-never-appear|also-should-never-appear/);
  });

  it("resolves owner to the display name from config.people", () => {
    const snapshot = buildSnapshot({
      date: "2026-01-15",
      epic: { key: "TEST-1", title: "Test Epic", targetDate: null },
      rawFeatures,
      judgment: judgment.value,
      overrides: {},
      now: new Date("2026-01-15T12:00:00.000Z"),
      timezone: "Europe/Dublin",
      collectionErrors: [],
      people: { alice: "Alice" },
    });
    expect(snapshot.features[0]?.owner).toBe("Alice");
  });
});

describe("runMerge", () => {
  const config = {
    epic: { key: "TEST-1", title: "Test Epic", startDate: "2026-01-01", targetDate: null },
    jira: { projectKey: "TEST", statusMap: {} },
    github: { org: "test-org" },
    timezone: "Europe/Dublin",
    scoreWeights: { shipped: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
    milestones: [],
    people: { alice: "Alice", bob: "Bob" },
  };

  const rawFile: RawFile = {
    schemaVersion: 1,
    date: "2026-01-15",
    generatedAt: "2026-01-15T08:00:00.000Z",
    epic: config.epic,
    features: [makeRawFeature()],
    collectionErrors: [],
  };

  function makeDeps(overrides: Partial<MergeDeps> = {}): MergeDeps {
    const files: Record<string, unknown> = {
      "data/raw/2026-01-15.json": rawFile,
      "data/pending/2026-01-15.json": PENDING,
      "data/judgment/2026-01-15.json": VALID_JUDGMENT,
    };
    return {
      readJsonFile: (path: string) => {
        if (!(path in files)) throw new Error(`Could not read ${path}`);
        return files[path];
      },
      loadOverrides: () => ({}),
      writeJsonAtomic: () => {},
      ...overrides,
    };
  }

  it("exits (returns ok:false) with a clear reason when judgment.json is missing", async () => {
    const deps = makeDeps({
      readJsonFile: (path) => {
        if (path.includes("judgment")) throw new Error(`Could not read ${path}`);
        if (path.includes("raw")) return rawFile;
        return PENDING;
      },
    });
    const result = await runMerge("2026-01-15", config as any, deps);
    expect(result.ok).toBe(false);
  });

  it("writes a schema-valid snapshot on success and never commits on failure", async () => {
    let written: unknown = null;
    const deps = makeDeps({ writeJsonAtomic: (_path, data) => { written = data; } });
    const result = await runMerge("2026-01-15", config as any, deps);
    expect(result.ok).toBe(true);
    expect(written).not.toBeNull();
    expect(() => StatusSnapshot.parse(written)).not.toThrow();
  });

  it("does not write anything when judgment is invalid", async () => {
    let written: unknown = null;
    const deps = makeDeps({
      readJsonFile: (path) => {
        if (path.includes("judgment")) return INVENTED_KEY_JUDGMENT;
        if (path.includes("raw")) return rawFile;
        return PENDING;
      },
      writeJsonAtomic: (_path, data) => { written = data; },
    });
    const result = await runMerge("2026-01-15", config as any, deps);
    expect(result.ok).toBe(false);
    expect(written).toBeNull();
  });
});
