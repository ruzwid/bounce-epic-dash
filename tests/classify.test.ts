import { describe, expect, it } from "vitest";
import {
  classifyPr,
  deriveSubtaskStatus,
  findReleaseGate,
  traceStackChain,
} from "../src/lib/classify.ts";
import { makePr } from "./fixtures/prs.ts";

const DEFAULT_BRANCH = "master";

describe("classifyPr", () => {
  it("merged to the default branch is shipped", () => {
    const pr = makePr({ number: 1, state: "MERGED", baseRefName: "master", mergedAt: "2026-01-02T00:00:00.000Z" });
    expect(classifyPr(pr, DEFAULT_BRANCH)).toEqual({ shippedToDefault: true });
  });

  it("merged to an integration branch is staged, not shipped", () => {
    const pr = makePr({
      number: 2,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(classifyPr(pr, DEFAULT_BRANCH)).toEqual({ shippedToDefault: false });
  });

  it("an open PR against the default branch is not shipped", () => {
    const pr = makePr({ number: 3, state: "OPEN", baseRefName: "master" });
    expect(classifyPr(pr, DEFAULT_BRANCH)).toEqual({ shippedToDefault: false });
  });
});

describe("traceStackChain", () => {
  it("traces a 3-deep stack down to the master-based PR", () => {
    // PR 1 is the bottom of the stack: head=feature-a, base=master.
    const pr1 = makePr({ number: 1, headRefName: "feature-a", baseRefName: "master" });
    // PR 2 stacks on top of PR 1's branch.
    const pr2 = makePr({ number: 2, headRefName: "feature-b", baseRefName: "feature-a" });
    // PR 3 (the one under test) stacks on top of PR 2's branch.
    const pr3 = makePr({ number: 3, headRefName: "feature-c", baseRefName: "feature-b" });

    const chain = traceStackChain(pr3, [pr1, pr2, pr3], DEFAULT_BRANCH);
    expect(chain).toEqual([2, 1]);
  });

  it("returns an empty chain when the PR's base is already the default branch", () => {
    const pr = makePr({ number: 1, baseRefName: "master" });
    expect(traceStackChain(pr, [pr], DEFAULT_BRANCH)).toEqual([]);
  });

  it("stops without throwing when a link in the chain can't be found", () => {
    // base points at a branch with no corresponding PR in allPrsInRepo.
    const pr = makePr({ number: 5, baseRefName: "orphaned-branch" });
    expect(traceStackChain(pr, [pr], DEFAULT_BRANCH)).toEqual([]);
  });
});

describe("findReleaseGate", () => {
  it("reports status 'open' when the release PR exists but is not yet merged", () => {
    const releasePr = makePr({
      number: 10,
      headRefName: "integration/wpp",
      baseRefName: "master",
      state: "OPEN",
    });
    const gate = findReleaseGate("integration/wpp", [releasePr], DEFAULT_BRANCH);
    expect(gate.status).toBe("open");
    expect(gate.pr?.number).toBe(10);
  });

  it("reports status 'merged' when the release PR is merged to the default branch", () => {
    const releasePr = makePr({
      number: 11,
      headRefName: "integration/wpp",
      baseRefName: "master",
      state: "MERGED",
      mergedAt: "2026-01-03T00:00:00.000Z",
    });
    const gate = findReleaseGate("integration/wpp", [releasePr], DEFAULT_BRANCH);
    expect(gate.status).toBe("merged");
  });

  it("reports status 'not_found' and never assumes shipped when no release PR exists", () => {
    const unrelatedPr = makePr({ number: 12, headRefName: "some-other-branch", baseRefName: "master" });
    const gate = findReleaseGate("integration/wpp", [unrelatedPr], DEFAULT_BRANCH);
    expect(gate.status).toBe("not_found");
    expect(gate.pr).toBeNull();
  });
});

describe("deriveSubtaskStatus", () => {
  const statusMap = { Done: "shipped" as const, "In Progress": "in_progress" as const, "To Do": "todo" as const };

  it("upgrades to 'shipped' when a linked PR shipped to the default branch, even if JIRA says In Progress", () => {
    const pr = makePr({ number: 20, state: "MERGED", baseRefName: "master", mergedAt: "2026-01-01T00:00:00.000Z" });
    expect(deriveSubtaskStatus("In Progress", statusMap, [pr], DEFAULT_BRANCH)).toBe("shipped");
  });

  it("is 'staged', not 'shipped', when the only linked PR merged to an integration branch", () => {
    const pr = makePr({
      number: 21,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveSubtaskStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("staged");
  });

  it("stays 'staged' (not 'shipped') even if that staged PR's release gate is merely open", () => {
    const stagedPr = makePr({
      number: 22,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    // The release PR being open elsewhere doesn't change this subtask's own status.
    expect(deriveSubtaskStatus("Done", statusMap, [stagedPr], DEFAULT_BRANCH)).toBe("staged");
  });

  it("falls back to 'todo' with no PRs and an unmapped JIRA status", () => {
    expect(deriveSubtaskStatus("Some Custom Status", statusMap, [], DEFAULT_BRANCH)).toBe("todo");
  });

  it("uses the mapped base status when there are no linked PRs", () => {
    expect(deriveSubtaskStatus("To Do", statusMap, [], DEFAULT_BRANCH)).toBe("todo");
  });
});
