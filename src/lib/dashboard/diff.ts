// src/lib/dashboard/diff.ts
// Since-last-snapshot changes, and the grouping that turns them into the
// Today page's narrative sections. Diffs current against previous by key —
// never fabricated when there's no real prior snapshot
// (computeChanges(current, null) is always []).
import type { z } from "zod";
import type { Feature as FeatureSchema, PrRef as PrRefSchema, StatusSnapshot as StatusSnapshotSchema, Story as StorySchema } from "../schema.ts";
import { STATUS_PRIORITY } from "../classify.ts";
import { storyPrs } from "../stories.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StoryT = z.infer<typeof StorySchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const STALL_DAYS = 14;

/** Stage order, for telling an advance from a slip. */
const STAGE_ORDER = ["not_started", "early", "underway", "nearly_done", "done"] as const;

export type ChangeItem =
  | { kind: "shipped"; feature: FeatureT; story: StoryT; pr: PrRefT; scoreDelta: number }
  | { kind: "released"; feature: FeatureT }
  | { kind: "sent_for_sign_off"; feature: FeatureT }
  | { kind: "newly_done_unverified"; feature: FeatureT; story: StoryT }
  | { kind: "newly_staged"; feature: FeatureT; story: StoryT; integrationBranch: string }
  | { kind: "newly_blocked"; feature: FeatureT; story: StoryT }
  | { kind: "regressed"; feature: FeatureT; story: StoryT; from: StoryT["status"]; to: StoryT["status"] }
  | { kind: "feature_regressed"; feature: FeatureT; from: FeatureT["stage"]; to: FeatureT["stage"]; scoreDelta: number }
  | { kind: "newly_stalled"; feature: FeatureT; daysSinceLastActivity: number }
  /** The stories themselves, not just how many: "+1 story" tells you the
   *  denominator moved, which is the least interesting half of the news.
   *  Named so a brand-new feature can still be rendered as a count — nine
   *  story titles under a feature that only just appeared is noise. */
  | { kind: "scope_added"; feature: FeatureT; stories: StoryT[]; isNewFeature: boolean };

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

/** Whether a snapshot was written after sign-off started being published
 *  (schemaVersion 3). Everything older defaults signedOff to false, which
 *  is indistinguishable from a real "not approved yet" — so a diff against
 *  one of those must stay silent about sign-off rather than announce every
 *  long-approved feature as approved overnight. */
function hasSignOffData(snapshot: StatusSnapshotT): boolean {
  return snapshot.schemaVersion >= 3;
}

/** Milestones where every tracked feature has reached stage "done" —
 *  the same rule milestoneProgress uses, inlined so the diff layer stays
 *  free of the config/weights machinery it would otherwise pull in. */
function doneMilestones(snapshot: StatusSnapshotT): Set<string> {
  const byMilestone = new Map<string, FeatureT[]>();
  for (const feature of snapshot.features) {
    byMilestone.set(feature.milestone, [...(byMilestone.get(feature.milestone) ?? []), feature]);
  }
  const done = new Set<string>();
  for (const [milestone, features] of byMilestone) {
    if (features.length > 0 && features.every((f) => f.stage === "done")) done.add(milestone);
  }
  return done;
}

/**
 * Whether a change on this feature is still worth reporting.
 *
 * Once a feature reads "done" — because product signed it off, or because
 * every story shipped — the housekeeping that follows is not news. A story
 * being closed in JIRA without a PR, or slipping between two flavours of
 * finished, is a bookkeeping artifact of how the tickets were wrapped up,
 * not an open question, and repeating it every day buries the changes that
 * do matter. Same reasoning as needsAttention() in search.ts.
 *
 * A milestone is only "done" when every one of its features is, so the
 * feature-level check also covers "and the milestone is finished" for
 * free — `milestonesDone` is passed in only to make that explicit at the
 * call site, and to keep the rule honest if the milestone rule ever
 * loosens.
 *
 * Deliberately NOT applied to: shipped (code reaching master is real news
 * whatever the ticket says, and it's often what closes the very gap a
 * signed-off feature was flagging), sign-off transitions, scope changes,
 * or a feature falling *out* of done.
 */
function isSettled(feature: FeatureT, milestonesDone: Set<string>): boolean {
  return feature.stage === "done" || milestonesDone.has(feature.milestone);
}

export function computeChanges(current: StatusSnapshotT, previous: StatusSnapshotT | null): ChangeItem[] {
  if (!previous) return [];

  const previousFeatureByKey = new Map(previous.features.map((f) => [f.key, f]));
  const milestonesDone = doneMilestones(current);
  const signOffComparable = hasSignOffData(current) && hasSignOffData(previous);
  const changes: ChangeItem[] = [];

  for (const feature of current.features) {
    const previousFeature = previousFeatureByKey.get(feature.key);

    if (!previousFeature) {
      changes.push({ kind: "scope_added", feature, stories: feature.stories, isNewFeature: true });
      continue;
    }

    if (signOffComparable) {
      if (feature.signedOff && !previousFeature.signedOff) {
        changes.push({ kind: "released", feature });
      } else if (feature.awaitingSignOff && !previousFeature.awaitingSignOff) {
        changes.push({ kind: "sent_for_sign_off", feature });
      }
    }

    const previousStoryKeys = new Set(previousFeature.stories.map((s) => s.key));
    const newStories = feature.stories.filter((s) => !previousStoryKeys.has(s.key));
    if (newStories.length > 0) {
      changes.push({ kind: "scope_added", feature, stories: newStories, isNewFeature: false });
    }

    const stageFrom = STAGE_ORDER.indexOf(previousFeature.stage);
    const stageTo = STAGE_ORDER.indexOf(feature.stage);
    if (stageTo < stageFrom) {
      changes.push({
        kind: "feature_regressed",
        feature,
        from: previousFeature.stage,
        to: feature.stage,
        scoreDelta: feature.score - previousFeature.score,
      });
    }

    const settled = isSettled(feature, milestonesDone);

    for (const story of feature.stories) {
      const previousStory = findStory(previousFeature, story.key);
      const previousStatus = previousStory?.status;
      // A story that arrived with this snapshot has nothing to compare
      // against — it's scope, reported above, not movement. (The old
      // behaviour counted one that arrived already shipped as "shipped
      // since yesterday", which it wasn't.)
      if (previousStatus === undefined) continue;
      if (previousStatus === story.status) continue;

      if (story.status === "shipped") {
        const pr = storyPrs(story).find((p) => p.shippedToDefault);
        if (pr) {
          changes.push({ kind: "shipped", feature, story, pr, scoreDelta: feature.score - previousFeature.score });
        }
        continue;
      }

      if (settled) continue;

      // Checked ahead of the generic regression rule below: "blocked" is
      // a specific enough thing to have earned its own heading, and
      // arriving there is news from any direction — including up from
      // todo, which STATUS_PRIORITY scores as an advance.
      if (story.status === "blocked") {
        changes.push({ kind: "newly_blocked", feature, story });
        continue;
      }

      // Losing ground is reported as losing ground, whatever the
      // destination status happens to be. Without this, a story falling
      // from shipped to done_unverified read identically to one climbing
      // there from in-progress — and four of those went unnoticed on the
      // day the epic's shipped count actually dropped.
      if (STATUS_PRIORITY[story.status] < STATUS_PRIORITY[previousStatus]) {
        changes.push({ kind: "regressed", feature, story, from: previousStatus, to: story.status });
        continue;
      }

      if (story.status === "done_unverified") {
        changes.push({ kind: "newly_done_unverified", feature, story });
      } else if (story.status === "staged") {
        const pr = storyPrs(story).find((p) => p.state === "MERGED" && !p.shippedToDefault);
        if (pr) {
          changes.push({ kind: "newly_staged", feature, story, integrationBranch: pr.baseRef });
        }
      }
    }

    // Stalled is feature-level, not per-story: fire only the day the
    // feature *crosses* the threshold, not every day it stays stalled.
    if (
      !settled &&
      feature.daysSinceLastActivity !== null &&
      feature.daysSinceLastActivity > STALL_DAYS &&
      (previousFeature.daysSinceLastActivity === null || previousFeature.daysSinceLastActivity <= STALL_DAYS)
    ) {
      changes.push({ kind: "newly_stalled", feature, daysSinceLastActivity: feature.daysSinceLastActivity });
    }
  }

  return changes;
}

export type ChangeSectionId = ChangeItem["kind"];

export type ChangeSection = {
  id: ChangeSectionId;
  /** Section heading — says the thing once, so the rows underneath don't
   *  have to repeat it. */
  title: string;
  /** The one-line explanation under the heading, for the sections whose
   *  meaning isn't self-evident. */
  note?: string;
  /** Which status hue the section's dot carries. */
  status: string;
  items: ChangeItem[];
};

/** Reading order: what moved forward, then what product now owns, then
 *  the gaps, then what went backwards, then what stopped, then scope.
 *  Progress first because it's short and it's the good news; problems get
 *  the room further down. */
const SECTION_ORDER: { id: ChangeSectionId; title: string; note?: string; status: string }[] = [
  // "pr_shipped", not "shipped": this section is about where the code
  // landed, so it takes the purple the PR chips inside it already use
  // rather than the status family's green (see styles.css).
  { id: "shipped", title: "Shipped to master", status: "pr_shipped" },
  {
    id: "released",
    title: "Signed off by product",
    note: "Approved out of Product Review — the feature is released.",
    status: "shipped",
  },
  {
    id: "sent_for_sign_off",
    title: "Sent for product review",
    note: "Engineering is done; product has been emailed and owes a decision.",
    status: "in_review",
  },
  { id: "newly_staged", title: "Merged, not on master", status: "staged" },
  {
    id: "newly_done_unverified",
    title: "Marked Done, no PR on master",
    note: "JIRA says Done, but no pull request proves the code reached master.",
    status: "done_unverified",
  },
  { id: "regressed", title: "Moved backwards", status: "blocked" },
  { id: "feature_regressed", title: "Features that slipped", status: "blocked" },
  { id: "newly_blocked", title: "Newly blocked", status: "blocked" },
  { id: "newly_stalled", title: "Newly stalled", status: "blocked" },
  {
    id: "scope_added",
    title: "Scope added",
    note: "New work joined the epic — the denominator moved, not the progress.",
    status: "todo",
  },
];

/** Buckets changes into ordered, titled sections, dropping the empty
 *  ones. The whole point of the grouping: a sentence like "JIRA says Done
 *  but no PR proves it" gets said once as a heading instead of once per
 *  row, which is what made the old flat feed unreadable. */
export function groupChanges(changes: ChangeItem[]): ChangeSection[] {
  return SECTION_ORDER.map((section) => ({
    ...section,
    items: changes.filter((c) => c.kind === section.id),
  })).filter((section) => section.items.length > 0);
}

/** Changes grouped by the person who owns them — the same set, read as a
 *  standup script rather than a chronology. */
export function groupChangesByOwner(changes: ChangeItem[]): { owner: string; items: ChangeItem[] }[] {
  const byOwner = new Map<string, ChangeItem[]>();
  for (const change of changes) {
    const owner = change.feature.owner;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), change]);
  }
  return [...byOwner.entries()]
    .map(([owner, items]) => ({ owner, items }))
    .sort((a, b) => b.items.length - a.items.length || a.owner.localeCompare(b.owner));
}
