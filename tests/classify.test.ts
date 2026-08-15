import { describe, expect, it } from "vitest";
import {
  classifyPr,
  deriveSignOff,
  deriveWorkStatus,
  findReleaseGate,
  isAutomatedReleasePr,
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

describe("isAutomatedReleasePr", () => {
  it("matches the empty automated-release title, regardless of which ticket it names", () => {
    expect(isAutomatedReleasePr("BOUN-11497 - Empty Pull Request For Automated Release")).toBe(true);
    expect(isAutomatedReleasePr("empty pull request for automated release")).toBe(true);
  });

  it("does not match a normal feature PR title", () => {
    expect(isAutomatedReleasePr("BOUN-11474 WPP Excel import")).toBe(false);
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

describe("deriveWorkStatus", () => {
  const statusMap = { Done: "shipped" as const, "In Progress": "in_progress" as const, "To Do": "todo" as const };

  it("upgrades to 'shipped' when a linked PR shipped to the default branch, even if JIRA says In Progress", () => {
    const pr = makePr({ number: 20, state: "MERGED", baseRefName: "master", mergedAt: "2026-01-01T00:00:00.000Z" });
    expect(deriveWorkStatus("In Progress", statusMap, [pr], DEFAULT_BRANCH)).toBe("shipped");
  });

  it("is 'done_unverified', not 'staged', when the only linked PR merged to an integration branch (GitHub can't confirm Done)", () => {
    const pr = makePr({
      number: 21,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("falls back to 'todo' with no PRs and an unmapped JIRA status", () => {
    expect(deriveWorkStatus("Some Custom Status", statusMap, [], DEFAULT_BRANCH)).toBe("todo");
  });

  it("uses the mapped base status when there are no linked PRs", () => {
    expect(deriveWorkStatus("To Do", statusMap, [], DEFAULT_BRANCH)).toBe("todo");
  });

  it("is 'done_unverified', not 'staged', when JIRA is Done and the only PR merged into a non-master branch", () => {
    const pr = makePr({
      number: 30,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'done_unverified', not 'shipped', when JIRA is Done and the only PR was closed without merging", () => {
    const pr = makePr({ number: 31, state: "CLOSED", baseRefName: "master" });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'done_unverified', not 'shipped', when JIRA is Done and there are no linked PRs at all", () => {
    expect(deriveWorkStatus("Done", statusMap, [], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'shipped' when JIRA is Done and a PR actually shipped to the default branch (real proof always wins)", () => {
    const pr = makePr({ number: 32, state: "MERGED", baseRefName: "master", mergedAt: "2026-01-01T00:00:00.000Z" });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("shipped");
  });

  it("stays 'staged' (not 'done_unverified') when JIRA is NOT Done and a PR merged into a non-master branch", () => {
    const pr = makePr({
      number: 33,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveWorkStatus("In Progress", statusMap, [pr], DEFAULT_BRANCH)).toBe("staged");
  });
});

describe("deriveSignOff", () => {
  const config = { productReviewStatus: "Product Review", signedOffStatuses: ["Done"] };

  it("treats reaching Done as the sign-off — epic work can only get there via Product Review", () => {
    expect(deriveSignOff("Done", config)).toEqual({ signedOff: true, awaitingSignOff: false });
  });

  it("is awaiting, not signed off, while the ticket sits in Product Review", () => {
    expect(deriveSignOff("Product Review", config)).toEqual({ signedOff: false, awaitingSignOff: true });
  });

  it("is neither for a ticket still in flight", () => {
    expect(deriveSignOff("In Progress", config)).toEqual({ signedOff: false, awaitingSignOff: false });
  });

  it("is neither when the status is missing entirely", () => {
    expect(deriveSignOff(null, config)).toEqual({ signedOff: false, awaitingSignOff: false });
  });

  it("accepts the legacy Approved field for tickets signed off before the flow changed", () => {
    expect(deriveSignOff("In Progress", config, true)).toEqual({ signedOff: true, awaitingSignOff: false });
  });

  it("lets a live Product Review out-vote a stale Approved label", () => {
    // The label's automations are off, so an old "Approved" can linger on a
    // ticket that has since been sent back round for review. The live
    // status is the truth; the dead field must never override it.
    expect(deriveSignOff("Product Review", config, true)).toEqual({ signedOff: false, awaitingSignOff: true });
  });

  it("never reports both states at once", () => {
    for (const status of ["Done", "Product Review", "In Progress", null]) {
      const state = deriveSignOff(status, config, true);
      expect(state.signedOff && state.awaitingSignOff).toBe(false);
    }
  });

  it("disables the waiting state entirely when no review status is configured", () => {
    const noReview = { productReviewStatus: null, signedOffStatuses: ["Done"] };
    expect(deriveSignOff("Product Review", noReview)).toEqual({ signedOff: false, awaitingSignOff: false });
  });
});
