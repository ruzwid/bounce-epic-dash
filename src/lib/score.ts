// src/lib/score.ts
// Pure, deterministic score + stage derivation. No network, no judgment.
import type { z } from "zod";
import type { Stage as StageSchema, WorkStatus as WorkStatusSchema } from "./schema.ts";

type WorkStatus = z.infer<typeof WorkStatusSchema>;
type Stage = z.infer<typeof StageSchema>;

export type ScoreBasis = {
  shipped: number;
  doneUnverified: number;
  staged: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  todo: number;
  total: number;
};

const STATUS_TO_BASIS_KEY: Record<WorkStatus, keyof Omit<ScoreBasis, "total">> = {
  shipped: "shipped",
  done_unverified: "doneUnverified",
  staged: "staged",
  in_review: "inReview",
  in_progress: "inProgress",
  blocked: "blocked",
  todo: "todo",
};

function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

/** score = weighted mean of story statuses using config.scoreWeights,
 *  rounded to the nearest 5. scoreBasis holds raw (unweighted) counts per
 *  status, for display — never derived from the score itself. */
export function computeScore(
  storyStatuses: WorkStatus[],
  weights: Record<WorkStatus, number>,
): { score: number; scoreBasis: ScoreBasis } {
  const scoreBasis: ScoreBasis = {
    shipped: 0,
    doneUnverified: 0,
    staged: 0,
    inReview: 0,
    inProgress: 0,
    blocked: 0,
    todo: 0,
    total: storyStatuses.length,
  };

  for (const status of storyStatuses) {
    scoreBasis[STATUS_TO_BASIS_KEY[status]] += 1;
  }

  if (storyStatuses.length === 0) {
    return { score: 0, scoreBasis };
  }

  const weightedSum = storyStatuses.reduce((sum, status) => sum + weights[status], 0);
  const mean = weightedSum / storyStatuses.length;
  const score = Math.max(0, Math.min(100, roundToNearest5(mean * 100)));

  return { score, scoreBasis };
}

/** stage = 0 not_started | <25 early | <70 underway | <100 nearly_done |
 *  100 done — and "done" additionally requires every story shipped to
 *  the default branch, not merely staged. A feature that hits 100 by
 *  weight alone (e.g. a config where staged scores fully) without every
 *  story actually shipped is "nearly_done", never "done". */
export function deriveStage(score: number, allStoriesShippedToDefault: boolean): Stage {
  if (score === 0) return "not_started";
  if (score < 25) return "early";
  if (score < 70) return "underway";
  if (score < 100) return "nearly_done";
  return allStoriesShippedToDefault ? "done" : "nearly_done";
}
