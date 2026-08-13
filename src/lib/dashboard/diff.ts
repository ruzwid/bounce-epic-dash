// src/lib/dashboard/diff.ts
// Since-last-snapshot changes: shipped, newly staged, newly blocked,
// newly stalled. Diffs current against previous by key — never fabricated
// when there's no real prior snapshot (computeChanges(current, null) is
// always []).
import type { z } from "zod";
import type { Feature as FeatureSchema, PrRef as PrRefSchema, StatusSnapshot as StatusSnapshotSchema, Story as StorySchema } from "../schema.ts";
import { storyPrs } from "../stories.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StoryT = z.infer<typeof StorySchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const STALL_DAYS = 14;

export type ChangeItem =
  | { kind: "shipped"; feature: FeatureT; story: StoryT; pr: PrRefT; scoreDelta: number }
  | { kind: "newly_done_unverified"; feature: FeatureT; story: StoryT }
  | { kind: "newly_staged"; feature: FeatureT; story: StoryT; integrationBranch: string }
  | { kind: "newly_blocked"; feature: FeatureT; story: StoryT }
  | { kind: "newly_stalled"; feature: FeatureT; daysSinceLastActivity: number };

function findStory(feature: FeatureT | undefined, key: string): StoryT | undefined {
  return feature?.stories.find((s) => s.key === key);
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

    for (const story of feature.stories) {
      const previousStory = findStory(previousFeature, story.key);
      const previousStatus = previousStory?.status;

      if (story.status === "shipped" && previousStatus !== "shipped") {
        const pr = storyPrs(story).find((p) => p.shippedToDefault);
        if (pr) {
          const scoreDelta = previousFeature ? feature.score - previousFeature.score : feature.score;
          changes.push({ kind: "shipped", feature, story, pr, scoreDelta });
        }
      } else if (story.status === "done_unverified" && previousStatus !== "done_unverified") {
        changes.push({ kind: "newly_done_unverified", feature, story });
      } else if (story.status === "staged" && previousStatus !== "staged") {
        const pr = storyPrs(story).find((p) => p.state === "MERGED" && !p.shippedToDefault);
        if (pr) {
          changes.push({ kind: "newly_staged", feature, story, integrationBranch: pr.baseRef });
        }
      } else if (story.status === "blocked" && previousStatus !== "blocked") {
        changes.push({ kind: "newly_blocked", feature, story });
      }
    }

    // Stalled is feature-level, not per-story: fire only the day the
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
