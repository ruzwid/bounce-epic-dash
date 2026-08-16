// src/lib/dashboard/scope.ts
// What the epic was asked to do, and how that changed.
//
// Every percentage on this dashboard is work over scope, and scope is the
// half nobody watches: this epic went from 47 stories to 74 in three days,
// which moved completion from 79% to 62% without a single piece of work
// going backwards. A reader who only sees the numerator concludes the team
// slowed down.
//
// Deliberately a diff of published snapshots rather than anything JIRA
// reports: the question is "what did this dashboard's own denominator do",
// and the snapshots are the only record of that.
import { storyTotals, type StoryTotals } from "./totals.ts";

/**
 * The slice of a snapshot this module reads — deliberately not the whole
 * thing.
 *
 * This is the only page that needs many snapshots at once, and a route
 * loader's return value is serialised into the prerendered HTML. Passing
 * full snapshots made the page 624KB of HTML for four days of history,
 * growing without bound; almost all of it was pull requests, acceptance
 * criteria and judge rationale that a scope diff never looks at. A real
 * StatusSnapshot still satisfies this type, so callers with one in hand
 * pass it straight through.
 */
export type ScopeStory = {
  key: string;
  summary: string;
  status: string;
};

export type ScopeFeature = {
  key: string;
  code: string;
  title: string;
  owner: string;
  stage: string;
  scoreBasis: StoryTotals;
  stories: ScopeStory[];
};

export type ScopeSnapshot = {
  date: string;
  features: ScopeFeature[];
};

type FeatureT = ScopeFeature;
type StoryT = ScopeStory;
type StatusSnapshotT = ScopeSnapshot;

export type ScopeEntry = {
  feature: FeatureT;
  /** Stories added to a feature that already existed. */
  stories: StoryT[];
  /** The feature itself is new to the epic. `stories` is then everything
   *  it arrived with. */
  isNewFeature: boolean;
};

export type ScopeStep = {
  date: string;
  previousDate: string;
  /** Story and feature counts after this step. */
  stories: number;
  features: number;
  storiesDelta: number;
  featuresDelta: number;
  added: ScopeEntry[];
  /** Features that disappeared between the two snapshots. Rare, and worth
   *  showing loudly when it happens: work leaving an epic silently is how
   *  a percentage improves without anything being finished. */
  removedFeatures: FeatureT[];
  /** Stories that disappeared from features that stayed. */
  removedStories: { feature: FeatureT; stories: StoryT[] }[];
};

export type ScopeTimeline = {
  steps: ScopeStep[];
  first: { date: string; stories: number; features: number };
  latest: { date: string; stories: number; features: number };
  /** Stories added across the whole window, net of removals. */
  netStories: number;
  netFeatures: number;
};

function countsFor(snapshot: StatusSnapshotT) {
  return {
    date: snapshot.date,
    stories: storyTotals(snapshot.features).total,
    features: snapshot.features.length,
  };
}

/** One step per consecutive pair of snapshots, newest first. Snapshots
 *  must be passed ascending by date. */
export function scopeTimeline(snapshots: StatusSnapshotT[]): ScopeTimeline | null {
  if (snapshots.length < 2) return null;

  const steps: ScopeStep[] = [];

  for (let i = 1; i < snapshots.length; i += 1) {
    const previous = snapshots[i - 1]!;
    const current = snapshots[i]!;
    const previousByKey = new Map(previous.features.map((f) => [f.key, f]));
    const currentByKey = new Map(current.features.map((f) => [f.key, f]));

    const added: ScopeEntry[] = [];
    const removedStories: { feature: FeatureT; stories: StoryT[] }[] = [];

    for (const feature of current.features) {
      const before = previousByKey.get(feature.key);
      if (!before) {
        added.push({ feature, stories: feature.stories, isNewFeature: true });
        continue;
      }
      const beforeKeys = new Set(before.stories.map((s) => s.key));
      const newStories = feature.stories.filter((s) => !beforeKeys.has(s.key));
      if (newStories.length > 0) added.push({ feature, stories: newStories, isNewFeature: false });

      const nowKeys = new Set(feature.stories.map((s) => s.key));
      const gone = before.stories.filter((s) => !nowKeys.has(s.key));
      if (gone.length > 0) removedStories.push({ feature, stories: gone });
    }

    const removedFeatures = previous.features.filter((f) => !currentByKey.has(f.key));

    const now = countsFor(current);
    const then = countsFor(previous);
    steps.push({
      date: current.date,
      previousDate: previous.date,
      stories: now.stories,
      features: now.features,
      storiesDelta: now.stories - then.stories,
      featuresDelta: now.features - then.features,
      added,
      removedFeatures,
      removedStories,
    });
  }

  const first = countsFor(snapshots[0]!);
  const latest = countsFor(snapshots[snapshots.length - 1]!);

  return {
    steps: steps.reverse(),
    first,
    latest,
    netStories: latest.stories - first.stories,
    netFeatures: latest.features - first.features,
  };
}

/** Where the growth came from, biggest first — the answer to "what got
 *  bigger", which the per-day timeline can't give at a glance once there
 *  are more than a few days of it. */
export function growthByFeature(timeline: ScopeTimeline): { feature: FeatureT; stories: number; isNew: boolean }[] {
  const byKey = new Map<string, { feature: FeatureT; stories: number; isNew: boolean }>();
  for (const step of timeline.steps) {
    for (const entry of step.added) {
      const existing = byKey.get(entry.feature.key);
      if (existing) {
        existing.stories += entry.stories.length;
        existing.isNew = existing.isNew || entry.isNewFeature;
        existing.feature = entry.feature;
      } else {
        byKey.set(entry.feature.key, {
          feature: entry.feature,
          stories: entry.stories.length,
          isNew: entry.isNewFeature,
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.stories - a.stories || a.feature.code.localeCompare(b.feature.code));
}
