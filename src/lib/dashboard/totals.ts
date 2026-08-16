// src/lib/dashboard/totals.ts
// One story count, summed from the features themselves.
//
// Everything that counts stories — the KPI strip, the epic percentage, a
// milestone's own score, the Slack summary — reads this rather than
// snapshot.kpis, for two reasons:
//
//   1. Completeness. The published kpis object grew a field at a time, so
//      an older snapshot has no inProgress/blocked/todo and a newer one
//      has all three. scoreBasis has carried every status since the first
//      snapshot, so summing features is right for every schema version.
//   2. Arithmetic. The old strip printed shipped + doneUnverified + staged
//      + inReview + blockedOrTodo, which silently omitted in_progress —
//      six figures that added up to 71 of 74 stories.
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import { loadAppConfig } from "./appConfig.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

export type StoryTotals = {
  shipped: number;
  doneUnverified: number;
  staged: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  todo: number;
  /** Every tracked story. The seven counts above always sum to this. */
  total: number;
};

const ZERO: StoryTotals = {
  shipped: 0,
  doneUnverified: 0,
  staged: 0,
  inReview: 0,
  inProgress: 0,
  blocked: 0,
  todo: 0,
  total: 0,
};

/** Story counts per status across any set of features — one feature, one
 *  milestone's worth, or a whole snapshot's.
 *
 *  Takes anything carrying a scoreBasis rather than a full Feature, so the
 *  Scope page can hand it the trimmed-down snapshots it loads (see
 *  ScopeSnapshot in scope.ts) without either side pretending they are
 *  something they aren't. */
export function storyTotals(features: readonly { scoreBasis: StoryTotals }[]): StoryTotals {
  return features.reduce(
    (acc, f) => ({
      shipped: acc.shipped + f.scoreBasis.shipped,
      doneUnverified: acc.doneUnverified + f.scoreBasis.doneUnverified,
      staged: acc.staged + f.scoreBasis.staged,
      inReview: acc.inReview + f.scoreBasis.inReview,
      inProgress: acc.inProgress + f.scoreBasis.inProgress,
      blocked: acc.blocked + f.scoreBasis.blocked,
      todo: acc.todo + f.scoreBasis.todo,
      total: acc.total + f.scoreBasis.total,
    }),
    ZERO,
  );
}

/** The weighted percentage those totals represent, on config.yaml's own
 *  scoreWeights — the same weights src/lib/score.ts gives one feature, so
 *  the epic figure, a milestone figure and a feature's own score can never
 *  disagree about what a staged story is worth. */
export function weightedPercent(totals: StoryTotals): number {
  if (totals.total === 0) return 0;
  const weights = loadAppConfig().scoreWeights;
  const weighted =
    totals.shipped * weights.shipped +
    totals.doneUnverified * weights.done_unverified +
    totals.staged * weights.staged +
    totals.inReview * weights.in_review +
    totals.inProgress * weights.in_progress +
    totals.blocked * weights.blocked +
    totals.todo * weights.todo;
  return Math.max(0, Math.min(100, Math.round((weighted / totals.total) * 100)));
}

/** Stories that count as finished work: shipped, plus the ones JIRA calls
 *  Done that no PR could confirm. Both carry weight 1.0 in the default
 *  config, and the burn-up and the velocity forecast both need the same
 *  definition of "done" to agree with the percentage in the header. */
export function doneStories(totals: StoryTotals): number {
  return totals.shipped + totals.doneUnverified;
}

/** How much scope moved between two snapshots, for the note under the KPI
 *  strip. Positive means the denominator grew — the reason a percentage
 *  can fall on a day when nothing regressed. */
export function scopeDelta(
  current: StatusSnapshotT,
  previous: StatusSnapshotT | null,
): { stories: number; features: number } | null {
  if (!previous) return null;
  const now = storyTotals(current.features);
  const then = storyTotals(previous.features);
  return {
    stories: now.total - then.total,
    features: current.features.length - previous.features.length,
  };
}
