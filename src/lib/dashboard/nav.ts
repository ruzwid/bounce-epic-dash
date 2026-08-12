// src/lib/dashboard/nav.ts
// Derivations the sidebar and the shell header need, kept out of the
// components so they stay pure and testable.
import type { z } from "zod";
import type { Feature as FeatureSchema, StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import { featureAnchorId } from "./anchors.ts";
import { needsAttention } from "./search.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

/** "F1.1" -> "f1-1", "DF4.1.1" -> "df4-1-1". Shared with the in-page
 *  anchor ids so a feature has exactly one slug in the whole app. */
export { featureAnchorId as featureSlug } from "./anchors.ts";

/** The feature a `/f/:code` URL refers to, or null. Matched on the slug,
 *  never on array position — snapshots reorder between days. */
export function featureBySlug(features: FeatureT[], slug: string): FeatureT | null {
  const wanted = slug.toLowerCase();
  return features.find((f) => featureAnchorId(f.code) === wanted) ?? null;
}

export type SidebarGroup = {
  id: string;
  label: string;
  /** The milestone ticket's own description, when the snapshot carries
   *  one. Empty for the fallback grouping below. */
  overview: string;
  features: FeatureT[];
};

/** M3 and M4 are always read together — one owner, one platform build —
 *  so they share a group even though they're separate milestones. */
const LIGHT_TIER_GROUP = ["M3", "M4"] as const;

function isLightTier(id: string): boolean {
  return (LIGHT_TIER_GROUP as readonly string[]).includes(id);
}

/**
 * One group per milestone, in the order the snapshot lists them, with
 * M3/M4 folded together.
 *
 * Snapshots written before milestones were published have none, so this
 * falls back to grouping by `feature.milestone` alone — an old snapshot
 * still renders a correct sidebar, just without the milestone titles.
 * Empty groups are dropped rather than rendered.
 */
export function sidebarGroups(snapshot: StatusSnapshotT): SidebarGroup[] {
  const featuresFor = (ids: readonly string[]) =>
    snapshot.features.filter((f) => ids.includes(f.milestone));

  if (snapshot.milestones.length > 0) {
    const groups: SidebarGroup[] = [];
    let lightAdded = false;

    for (const milestone of snapshot.milestones) {
      if (isLightTier(milestone.id)) {
        if (lightAdded) continue;
        lightAdded = true;
        const light = snapshot.milestones.filter((m) => isLightTier(m.id));
        groups.push({
          id: "m3-m4",
          label: `${light.map((m) => m.id).join(" / ")} · ${light[0]?.owner ?? "light tier"}`,
          overview: light.map((m) => m.overview).filter(Boolean).join("\n\n"),
          features: featuresFor(light.map((m) => m.id)),
        });
        continue;
      }
      groups.push({
        id: milestone.id.toLowerCase(),
        label: `${milestone.id} · ${stripMilestonePrefix(milestone)}`,
        overview: milestone.overview,
        features: featuresFor([milestone.id]),
      });
    }
    return groups.filter((group) => group.features.length > 0);
  }

  return [
    { id: "m1", label: "M1 · Core efficiency", overview: "", features: featuresFor(["M1"]) },
    { id: "m2", label: "M2 · Expansion", overview: "", features: featuresFor(["M2"]) },
    { id: "m3-m4", label: "M3 / M4 · Light tier", overview: "", features: featuresFor(LIGHT_TIER_GROUP) },
  ].filter((group) => group.features.length > 0);
}

/** JIRA milestone summaries are written "M1 — Core Operational Efficiency";
 *  the group label already shows the id, so drop the duplicate. */
function stripMilestonePrefix(milestone: StatusSnapshotT["milestones"][number]): string {
  return milestone.title.replace(new RegExp(`^\\s*${milestone.id}\\s*[—–:-]?\\s*`), "").trim() || milestone.title;
}

/** Every feature currently flagged by the "needs attention" definition in
 *  search.ts — the sidebar badge and the Needs attention page always agree
 *  because they both call this. */
export function attentionFeatures(snapshot: StatusSnapshotT, now: Date): FeatureT[] {
  return snapshot.features.filter((f) => needsAttention(f, now));
}

export type AttentionReason = { kind: "blocked" | "stalled" | "review_wait" | "callout"; detail: string };

const STALL_DAYS = 7;
const REVIEW_WAIT_DAYS = 2;

function daysBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60 * 24);
}

/** Why a feature is on the attention list, spelled out. needsAttention()
 *  answers yes/no; this answers "because of what", using the same
 *  thresholds so the two can never disagree. */
export function attentionReasons(feature: FeatureT, now: Date): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (feature.scoreBasis.blocked > 0) {
    reasons.push({
      kind: "blocked",
      detail: `${feature.scoreBasis.blocked} subtask${feature.scoreBasis.blocked === 1 ? "" : "s"} blocked`,
    });
  }

  if (feature.stage !== "done" && feature.daysSinceLastActivity !== null && feature.daysSinceLastActivity > STALL_DAYS) {
    reasons.push({ kind: "stalled", detail: `No activity for ${feature.daysSinceLastActivity} days` });
  }

  const waiting = feature.subtasks.flatMap((subtask) =>
    subtask.prs.filter(
      (pr) => pr.state === "OPEN" && pr.reviewRequests.length > 0 && daysBetween(pr.updatedAt, now) > REVIEW_WAIT_DAYS,
    ),
  );
  if (waiting.length > 0) {
    const oldest = Math.max(...waiting.map((pr) => Math.floor(daysBetween(pr.updatedAt, now))));
    reasons.push({
      kind: "review_wait",
      detail: `${waiting.length} PR${waiting.length === 1 ? "" : "s"} waiting on review, oldest ${oldest}d`,
    });
  }

  for (const callout of feature.callouts) {
    reasons.push({ kind: "callout", detail: callout.message });
  }

  return reasons;
}

export type EpicProgress = {
  /** weighted completion across every tracked subtask, 0-100 */
  percent: number;
  /** share of all tracked subtasks, for the segmented bar */
  shippedShare: number;
  stagedShare: number;
  inReviewShare: number;
};

/** Epic-level completion, derived from the published KPI counts using the
 *  same weights as a single feature's score (src/lib/score.ts): shipped
 *  counts full, staged half, in review a third. Deliberately *not* the
 *  mean of feature scores — that would weight a one-subtask feature the
 *  same as a fourteen-subtask one. */
export function epicProgress(kpis: StatusSnapshotT["kpis"]): EpicProgress {
  const total = kpis.subtasksTracked;
  if (total === 0) {
    return { percent: 0, shippedShare: 0, stagedShare: 0, inReviewShare: 0 };
  }
  const weighted = kpis.shipped * 1 + kpis.staged * 0.5 + kpis.inReview * 0.3;
  return {
    percent: Math.round((weighted / total) * 100),
    shippedShare: (kpis.shipped / total) * 100,
    stagedShare: (kpis.staged / total) * 100,
    inReviewShare: (kpis.inReview / total) * 100,
  };
}

/** Every open PR across the snapshot, newest activity first — the Reviews
 *  page's fallback view when reviewQueue is empty (a snapshot can have no
 *  outstanding *requests* while still having open PRs). */
export function openPullRequests(snapshot: StatusSnapshotT) {
  return snapshot.features
    .flatMap((feature) =>
      feature.subtasks.flatMap((subtask) =>
        subtask.prs.filter((pr) => pr.state === "OPEN").map((pr) => ({ feature, subtask, pr })),
      ),
    )
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());
}
