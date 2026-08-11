import { describe, expect, it } from "vitest";
import { toPending, type RawFeature } from "../scripts/collect.ts";
import { FILLED_BODY, UNFILLED_TEMPLATE_BODY } from "./fixtures/pr-bodies.ts";

function makeFeature(overrides: Partial<RawFeature> = {}): RawFeature {
  return {
    key: "TEST-10",
    code: "F1.1",
    title: "Do the thing",
    milestone: "M1",
    tier: "full",
    owner: "alice",
    repos: ["service-a"],
    score: 100,
    scoreBasis: { shipped: 1, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 1 },
    stage: "done",
    daysSinceLastActivity: 1,
    daysInStaged: null,
    releaseGate: null,
    acBullets: [],
    subtasks: [],
    dataOk: true,
    ...overrides,
  };
}

function makePrRecord(overrides: Partial<RawFeature["subtasks"][number]["prs"][number]>) {
  return {
    repo: "service-a",
    number: 1,
    title: "[TEST-11] add thing",
    url: "https://github.com/test-org/service-a/pull/1",
    state: "MERGED" as const,
    isDraft: false,
    baseRef: "master",
    headRef: "TEST-11-add-thing",
    shippedToDefault: true,
    mergedAt: "2026-01-12T00:00:00.000Z",
    updatedAt: "2026-01-12T00:00:00.000Z",
    stackChain: [],
    reviewRequests: [],
    filesTouched: ["src/thing.ts"],
    body: null,
    ...overrides,
  };
}

describe("toPending PR body wiring", () => {
  it("always includes body/bodyTruncated/bodySignal keys, even when the raw PR had no body", () => {
    const feature = makeFeature({
      subtasks: [
        {
          key: "TEST-11",
          summary: "Sub A",
          jiraStatus: "Done",
          status: "shipped",
          assignee: "Alice",
          updatedAt: "2026-01-12T00:00:00.000Z",
          prs: [makePrRecord({ body: null })],
        },
      ],
    });
    const pending = toPending(feature);
    const pr = pending.prs[0];
    expect(pr).toBeDefined();
    expect(pr).toHaveProperty("body");
    expect(pr).toHaveProperty("bodyTruncated");
    expect(pr).toHaveProperty("bodySignal");
    expect(pr?.body).toBeNull();
    expect(pr?.bodySignal).toBe("template_only");
  });

  it("carries a cleaned, real PR body through into pending.json", () => {
    const feature = makeFeature({
      subtasks: [
        {
          key: "TEST-11",
          summary: "Sub A",
          jiraStatus: "Done",
          status: "shipped",
          assignee: "Alice",
          updatedAt: "2026-01-12T00:00:00.000Z",
          prs: [makePrRecord({ body: FILLED_BODY })],
        },
      ],
    });
    const pending = toPending(feature);
    const pr = pending.prs[0];
    expect(pr?.body).toMatch(/validateDemographicQuestions/);
    // The review-tool boilerplate must not survive into pending.json either.
    expect(pr?.body).not.toMatch(/Repository to Pull From/);
    expect(pr?.bodySignal).toBeNull();
  });

  it("marks an unfilled-template PR body as template_only rather than passing it through raw", () => {
    const feature = makeFeature({
      subtasks: [
        {
          key: "TEST-11",
          summary: "Sub A",
          jiraStatus: "Done",
          status: "shipped",
          assignee: "Alice",
          updatedAt: "2026-01-12T00:00:00.000Z",
          prs: [makePrRecord({ body: UNFILLED_TEMPLATE_BODY })],
        },
      ],
    });
    const pending = toPending(feature);
    const pr = pending.prs[0];
    expect(pr?.body).toBeNull();
    expect(pr?.bodySignal).toBe("template_only");
  });
});
