// src/lib/dashboard/diff.ts
// Since-last-snapshot changes: shipped, newly staged, newly blocked,
// newly stalled. Diffs current against previous by key — never fabricated
// when there's no real prior snapshot (computeChanges(current, null) is
// always []).
import type { z } from "zod";
import type { Feature as FeatureSchema, PrRef as PrRefSchema, StatusSnapshot as StatusSnapshotSchema, Subtask as SubtaskSchema } from "../schema.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type SubtaskT = z.infer<typeof SubtaskSchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const STALL_DAYS = 14;

export type ChangeItem =
  | { kind: "shipped"; feature: FeatureT; subtask: SubtaskT; pr: PrRefT; scoreDelta: number }
  | { kind: "newly_staged"; feature: FeatureT; subtask: SubtaskT; integrationBranch: string }
  | { kind: "newly_blocked"; feature: FeatureT; subtask: SubtaskT }
  | { kind: "newly_stalled"; feature: FeatureT; daysSinceLastActivity: number };

function findSubtask(feature: FeatureT | undefined, key: string): SubtaskT | undefined {
  return feature?.subtasks.find((s) => s.key === key);
}

/** "since yesterday" / "since Friday" / "since 2026-07-28" — names the
 *  real gap between two snapshot dates rather than a hardcoded word. */
export function formatSinceLabel(previousDate: string, currentDate: string): string {
  const prev = new Date(`${previousDate}T00:00:00Z`);
  const curr = new Date(`${currentDate}T00:00:00Z`);
  const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "since yesterday";
  if (diffDays > 1 && diffDays <= 6) {
    return `since ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(prev)}`;
  }
  return `since ${previousDate}`;
}

export function computeChanges(current: StatusSnapshotT, previous: StatusSnapshotT | null): ChangeItem[] {
  if (!previous) return [];

  const previousFeatureByKey = new Map(previous.features.map((f) => [f.key, f]));
  const changes: ChangeItem[] = [];

  for (const feature of current.features) {
    const previousFeature = previousFeatureByKey.get(feature.key);

    for (const subtask of feature.subtasks) {
      const previousSubtask = findSubtask(previousFeature, subtask.key);
      const previousStatus = previousSubtask?.status;

      if (subtask.status === "shipped" && previousStatus !== "shipped") {
        const pr = subtask.prs.find((p) => p.shippedToDefault);
        if (pr) {
          const scoreDelta = previousFeature ? feature.score - previousFeature.score : feature.score;
          changes.push({ kind: "shipped", feature, subtask, pr, scoreDelta });
        }
      } else if (subtask.status === "staged" && previousStatus !== "staged") {
        const pr = subtask.prs.find((p) => p.state === "MERGED" && !p.shippedToDefault);
        if (pr) {
          changes.push({ kind: "newly_staged", feature, subtask, integrationBranch: pr.baseRef });
        }
      } else if (subtask.status === "blocked" && previousStatus !== "blocked") {
        changes.push({ kind: "newly_blocked", feature, subtask });
      }
    }

    // Stalled is feature-level, not per-subtask: fire only the day the
    // feature *crosses* the threshold, not every day it stays stalled.
    if (
      previousFeature &&
      feature.daysSinceLastActivity !== null &&
      feature.daysSinceLastActivity > STALL_DAYS &&
      (previousFeature.daysSinceLastActivity === null || previousFeature.daysSinceLastActivity <= STALL_DAYS)
    ) {
      changes.push({ kind: "newly_stalled", feature, daysSinceLastActivity: feature.daysSinceLastActivity });
    }
  }

  return changes;
}
