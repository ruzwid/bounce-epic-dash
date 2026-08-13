import { describe, expect, it } from "vitest";
import { computeScore, deriveStage } from "../src/lib/score.ts";

const DEFAULT_WEIGHTS = {
  shipped: 1.0,
  done_unverified: 1.0,
  staged: 0.5,
  in_review: 0.3,
  in_progress: 0.15,
  blocked: 0,
  todo: 0,
};

describe("computeScore", () => {
  it("computes a weighted mean and rounds to the nearest 5", () => {
    // (1.0 + 0.3 + 0) / 3 * 100 = 43.33... -> rounds to 45.
    const result = computeScore(["shipped", "in_review", "todo"], DEFAULT_WEIGHTS);
    expect(result.score).toBe(45);
  });

  it("produces a scoreBasis with raw counts per status, not weighted values", () => {
    const result = computeScore(
      ["shipped", "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo"],
      DEFAULT_WEIGHTS,
    );
    expect(result.scoreBasis).toEqual({
      shipped: 2,
      doneUnverified: 1,
      staged: 1,
      inReview: 1,
      inProgress: 1,
      blocked: 1,
      todo: 1,
      total: 8,
    });
  });

  it("weights done_unverified the same as shipped, and never folds its count into scoreBasis.shipped", () => {
    const result = computeScore(["done_unverified", "done_unverified"], DEFAULT_WEIGHTS);
    expect(result.score).toBe(100);
    expect(result.scoreBasis.shipped).toBe(0);
    expect(result.scoreBasis.doneUnverified).toBe(2);
  });

  it("is 100 only when every story is shipped", () => {
    const result = computeScore(["shipped", "shipped", "shipped"], DEFAULT_WEIGHTS);
    expect(result.score).toBe(100);
  });

  it("is 0, not NaN, when there are no stories", () => {
    const result = computeScore([], DEFAULT_WEIGHTS);
    expect(result.score).toBe(0);
    expect(result.scoreBasis.total).toBe(0);
  });
});

describe("deriveStage", () => {
  it.each([
    [0, true, "not_started"],
    [10, true, "early"],
    [24, true, "early"],
    [25, true, "underway"],
    [69, true, "underway"],
    [70, true, "nearly_done"],
    [99, true, "nearly_done"],
  ] as const)("score %i -> %s", (score, allShipped, expected) => {
    expect(deriveStage(score, allShipped)).toBe(expected);
  });

  it("is 'done' at score 100 when every story shipped to the default branch", () => {
    expect(deriveStage(100, true)).toBe("done");
  });

  it("is 'nearly_done', NOT 'done', at score 100 when stories are only staged (not shipped)", () => {
    // A feature can hit 100 by weight (e.g. custom scoreWeights where staged
    // counts fully) while every story is still stuck on an integration
    // branch. That must never render as "done".
    expect(deriveStage(100, false)).toBe("nearly_done");
  });

  it("is 'done' when signedOff is true, even at score 0", () => {
    expect(deriveStage(0, false, true)).toBe("done");
  });

  it("is 'done' when signedOff is true, even with stories not all shipped", () => {
    expect(deriveStage(60, false, true)).toBe("done");
  });

  it("defaults signedOff to false, unaffected when the 3rd argument is omitted", () => {
    expect(deriveStage(100, false)).toBe("nearly_done");
  });

  it("is NOT 'done' at score 100 with allStoriesShippedToDefault false and signedOff false", () => {
    // Pins an invariant src/lib/dashboard/nav.ts's signedOffUnverifiedStories
    // depends on for correctness: the *ordinary* (non-signed-off) "done"
    // path requires every story literally shipped, never done_unverified.
    // signedOffUnverifiedStories assumes a done_unverified story can only
    // coexist with stage "done" via the signedOff override — if this ever
    // stopped being true (e.g. deriveStage's score-band path loosened to
    // allow "done" without every story shipped), that selector would start
    // missing real signed-off-with-unverified-work cases silently.
    expect(deriveStage(100, false, false)).not.toBe("done");
  });
});

describe("computeScore + deriveStage integration: staged never masquerades as done", () => {
  it("a fully-staged feature with staged-weighted-as-1.0 scores 100 but is not done", () => {
    const stagedCountsAsFullWeight = { ...DEFAULT_WEIGHTS, staged: 1.0 };
    const { score } = computeScore(["staged", "staged"], stagedCountsAsFullWeight);
    expect(score).toBe(100);
    expect(deriveStage(score, false)).toBe("nearly_done");
  });
});
