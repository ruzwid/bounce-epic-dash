// src/lib/dashboard/nav.ts
// Derivations the sidebar and the shell header need, kept out of the
// components so they stay pure and testable.
import type { z } from "zod";
import type {
  Feature as FeatureSchema,
  PrRef as PrRefSchema,
  Stage as StageSchema,
  StatusSnapshot as StatusSnapshotSchema,
  Story as StorySchema,
} from "../schema.ts";
import { deriveStage } from "../score.ts";
import { loadAppConfig } from "./appConfig.ts";
import { featureAnchorId } from "./anchors.ts";
import { needsAttention } from "./search.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StoryT = z.infer<typeof StorySchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;
type StageT = z.infer<typeof StageSchema>;

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
  /** The part of `label` after "· " — the owner/tier text, split out so a
   *  caller linking each id in `milestoneIds` individually (the merged
   *  M3/M4 case) doesn't have to re-parse `label` to find it. */
  suffix: string;
  /** The milestone ticket's own description, when the snapshot carries
   *  one. Empty for the fallback grouping below. */
  overview: string;
  features: FeatureT[];
  /** Every Milestone id ("M1", or ["M3","M4"] for the merged group) this
   *  heading represents a page for — one ShellLink per id, since M3/M4
   *  are two separate tickets sharing one sidebar/Today heading. */
  milestoneIds: string[];
};

/** M3 and M4 are always read together — one owner, one platform build —
 *  so they share a group even though they're separate milestones. */
const LIGHT_TIER_GROUP = ["M3", "M4"] as const;

function isLightTier(id: string): boolean {
  return (LIGHT_TIER_GROUP as readonly string[]).includes(id);
}

/** Shared with milestoneBySlug() below, so a snapshot written before
 *  milestones were published gets the exact same fallback title in the
 *  sidebar as on the milestone page it links to. */
const FALLBACK_MILESTONE_TITLES: Record<string, string> = {
  M1: "Core efficiency",
  M2: "Expansion",
  M3: "Light tier",
  M4: "Light tier",
};

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
        const suffix = light[0]?.owner ?? "light tier";
        groups.push({
          id: "m3-m4",
          label: `${light.map((m) => m.id).join(" / ")} · ${suffix}`,
          suffix,
          overview: light.map((m) => m.overview).filter(Boolean).join("\n\n"),
          features: featuresFor(light.map((m) => m.id)),
          milestoneIds: light.map((m) => m.id),
        });
        continue;
      }
      groups.push({
        id: milestone.id.toLowerCase(),
        label: `${milestone.id} · ${stripMilestonePrefix(milestone)}`,
        suffix: stripMilestonePrefix(milestone),
        overview: milestone.overview,
        features: featuresFor([milestone.id]),
        milestoneIds: [milestone.id],
      });
    }
    return groups.filter((group) => group.features.length > 0);
  }

  return [
    {
      id: "m1",
      label: "M1 · Core efficiency",
      suffix: "Core efficiency",
      overview: "",
      features: featuresFor(["M1"]),
      milestoneIds: ["M1"],
    },
    {
      id: "m2",
      label: "M2 · Expansion",
      suffix: "Expansion",
      overview: "",
      features: featuresFor(["M2"]),
      milestoneIds: ["M2"],
    },
    {
      id: "m3-m4",
      label: "M3 / M4 · Light tier",
      suffix: "Light tier",
      overview: "",
      features: featuresFor(LIGHT_TIER_GROUP),
      milestoneIds: [...LIGHT_TIER_GROUP],
    },
  ].filter((group) => group.features.length > 0);
}

export type MilestoneOverview = {
  /** "M1" */
  id: string;
  /** The milestone's own JIRA key, for linking out — null when this
   *  snapshot predates published milestones (see sidebarGroups above). */
  key: string | null;
  title: string;
  overview: string;
  tier: "full" | "light" | null;
  owner: string | null;
  features: FeatureT[];
};

/** The milestone a `/m/:id` URL refers to, or null. Falls back to
 *  grouping by `feature.milestone` alone for snapshots written before
 *  milestones were published, same as sidebarGroups(). */
export function milestoneBySlug(snapshot: StatusSnapshotT, slug: string): MilestoneOverview | null {
  const id = slug.toUpperCase();
  const features = snapshot.features.filter((f) => f.milestone === id);
  if (features.length === 0) return null;

  const summary = snapshot.milestones.find((m) => m.id === id) ?? null;
  return {
    id,
    key: summary?.key ?? null,
    title: summary ? stripMilestonePrefix(summary) : (FALLBACK_MILESTONE_TITLES[id] ?? id),
    overview: summary?.overview ?? "",
    tier: summary?.tier ?? null,
    owner: summary?.owner ?? null,
    features,
  };
}

export type MilestoneProgress = {
  score: number;
  stage: StageT;
  shipped: number;
  doneUnverified: number;
  staged: number;
  inReview: number;
  blockedOrTodo: number;
  storiesTracked: number;
};

/** Same weighted-mean math as a single feature's score (src/lib/score.ts)
 *  and the epic-level epicProgress() below, just summed across one
 *  milestone's features instead of one feature's stories or the whole
 *  epic's KPIs — so "M1 is 80% done" and "F1.1 is 80% done" never disagree
 *  about what "done" means. */
export function milestoneProgress(features: FeatureT[]): MilestoneProgress {
  const totals = features.reduce(
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
    { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 0 },
  );

  const weights = loadAppConfig().scoreWeights;
  const weighted =
    totals.shipped * weights.shipped +
    totals.doneUnverified * weights.done_unverified +
    totals.staged * weights.staged +
    totals.inReview * weights.in_review +
    totals.inProgress * weights.in_progress +
    totals.blocked * weights.blocked +
    totals.todo * weights.todo;
  const score = totals.total === 0 ? 0 : Math.max(0, Math.min(100, Math.round((weighted / totals.total) * 100)));
  const allDone = features.length > 0 && features.every((f) => f.stage === "done");

  return {
    score,
    stage: deriveStage(score, allDone),
    shipped: totals.shipped,
    doneUnverified: totals.doneUnverified,
    staged: totals.staged,
    inReview: totals.inReview,
    blockedOrTodo: totals.blocked + totals.todo,
    storiesTracked: totals.total,
  };
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
      detail: `${feature.scoreBasis.blocked} story${feature.scoreBasis.blocked === 1 ? "" : "s"} blocked`,
    });
  }

  if (feature.stage !== "done" && feature.daysSinceLastActivity !== null && feature.daysSinceLastActivity > STALL_DAYS) {
    reasons.push({ kind: "stalled", detail: `No activity for ${feature.daysSinceLastActivity} days` });
  }

  const waiting = feature.stories.flatMap((story) =>
    story.prs.filter(
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
  /** weighted completion across every tracked story, 0-100 */
  percent: number;
  /** share of all tracked stories, for the segmented bar */
  shippedShare: number;
  doneUnverifiedShare: number;
  stagedShare: number;
  inReviewShare: number;
};

/** Epic-level completion, derived from the published KPI counts using the
 *  same weights as a single feature's score (src/lib/score.ts): shipped
 *  and done_unverified both count full, staged half, in review a third.
 *  Deliberately *not* the mean of feature scores — that would weight a
 *  one-story feature the same as a fourteen-story one. */
export function epicProgress(kpis: StatusSnapshotT["kpis"]): EpicProgress {
  const total = kpis.storiesTracked;
  if (total === 0) {
    return { percent: 0, shippedShare: 0, doneUnverifiedShare: 0, stagedShare: 0, inReviewShare: 0 };
  }
  const weighted = kpis.shipped * 1 + kpis.doneUnverified * 1 + kpis.staged * 0.5 + kpis.inReview * 0.3;
  return {
    percent: Math.round((weighted / total) * 100),
    shippedShare: (kpis.shipped / total) * 100,
    doneUnverifiedShare: (kpis.doneUnverified / total) * 100,
    stagedShare: (kpis.staged / total) * 100,
    inReviewShare: (kpis.inReview / total) * 100,
  };
}

/** The epic's own Stage, on the same 0/25/70/100 bands and "done only if
 *  every feature actually shipped" rule as a feature or milestone — so
 *  the epic's Jira link icon (Sidebar) reads the same six-hue language as
 *  everything nested under it. */
export function epicStage(snapshot: StatusSnapshotT): StageT {
  const { percent } = epicProgress(snapshot.kpis);
  const allDone = snapshot.features.length > 0 && snapshot.features.every((f) => f.stage === "done");
  return deriveStage(percent, allDone);
}

/** Every open PR across the snapshot, newest activity first — every PR
 *  tracked to a story, whether or not it has an outstanding review
 *  request (a snapshot can have no requests while still having open
 *  work). The base reviewsByTicket() below groups by ticket. */
export function openPullRequests(snapshot: StatusSnapshotT) {
  return snapshot.features
    .flatMap((feature) =>
      feature.stories.flatMap((story) => [
        ...story.prs.filter((pr) => pr.state === "OPEN").map((pr) => ({ feature, story, subtask: null, pr })),
        // A PR opened against a Sub-task belongs to the sub-task, not to
        // its Story. Walking only stories is what made these invisible.
        ...story.subtasks.flatMap((subtask) =>
          subtask.prs.filter((pr) => pr.state === "OPEN").map((pr) => ({ feature, story, subtask, pr })),
        ),
      ]),
    )
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());
}

export type PrReviewStatus = {
  pr: PrRefT;
  /** Reviewers GitHub is still waiting on for this PR, each paired with
   *  how many days they've been waited on. Empty when the PR is open but
   *  nobody's been asked yet. */
  waitingOn: { reviewer: string; ageDays: number }[];
};

/** The ticket a group of PRs actually hangs off — a Story, or one of its
 *  Sub-tasks. Grouping by the owning ticket (rather than always by the
 *  Story) keeps a stacked chain like BOUN-11497/8/9 as three reviewable
 *  units, because that is what they are. */
export type ReviewTicket = {
  key: string;
  summary: string;
  status: StoryT["status"];
  assignee: string | null;
  /** True when these PRs sit on a Sub-task — drives the Jira icon and the
   *  "under <story>" attribution line. */
  isSubtask: boolean;
  /** The Story this ticket is, or belongs to. */
  story: StoryT;
};

export type TicketReviewGroup = {
  feature: FeatureT;
  ticket: ReviewTicket;
  /** This ticket's open PRs. Almost always one — but a ticket that spans
   *  repos (API + admin + web, say) opens more than one, and those are
   *  one unit of work, not unrelated rows the reader has to notice share
   *  a key. */
  prs: PrReviewStatus[];
  /** The oldest pending request across every PR here, for sorting — null
   *  when nothing in the group has a reviewer requested yet. */
  oldestWaitDays: number | null;
};

/** Every open PR, grouped by the ticket it belongs to and annotated with
 *  who (if anyone) GitHub is still waiting on. The Reviews page's one
 *  data source: "same ticket, three repos" is one card, not three
 *  unrelated rows sorted apart by coincidence of PR update time. */
export function reviewsByTicket(snapshot: StatusSnapshotT): TicketReviewGroup[] {
  const waitingByPr = new Map<string, { reviewer: string; ageDays: number }[]>();
  for (const request of snapshot.reviewQueue) {
    const key = `${request.pr.repo}#${request.pr.number}`;
    const list = waitingByPr.get(key) ?? [];
    list.push({ reviewer: request.reviewer, ageDays: request.ageDays });
    waitingByPr.set(key, list);
  }

  const groups = new Map<string, TicketReviewGroup>();
  for (const { feature, story, subtask, pr } of openPullRequests(snapshot)) {
    const owner = subtask ?? story;
    const ticket: ReviewTicket = {
      key: owner.key,
      summary: owner.summary,
      status: owner.status,
      assignee: owner.assignee,
      isSubtask: subtask !== null,
      story,
    };
    const group = groups.get(ticket.key) ?? { feature, ticket, prs: [], oldestWaitDays: null };
    group.prs.push({ pr, waitingOn: waitingByPr.get(`${pr.repo}#${pr.number}`) ?? [] });
    groups.set(ticket.key, group);
  }

  for (const group of groups.values()) {
    const waits = group.prs.flatMap((p) => p.waitingOn.map((w) => w.ageDays));
    group.oldestWaitDays = waits.length > 0 ? Math.max(...waits) : null;
  }

  // Oldest-waiting-first, the same thesis the page always had — a ticket
  // with no reviewer requested at all sorts after every ticket with an
  // actual wait in progress, not because it matters less, but because it
  // has no age to sort by.
  return [...groups.values()].sort((a, b) => (b.oldestWaitDays ?? -1) - (a.oldestWaitDays ?? -1));
}

export type StoryReviewGroup = {
  feature: FeatureT;
  story: StoryT;
  /** One entry per ticket under this story that has open PRs — the story
   *  itself (if it has direct open PRs) and/or any of its Sub-tasks.
   *  Almost always just one entry; a stacked chain like BOUN-11497/8/9
   *  is what puts more than one here. */
  tickets: TicketReviewGroup[];
  /** The oldest pending request across every ticket here, for sorting —
   *  same convention as TicketReviewGroup.oldestWaitDays. */
  oldestWaitDays: number | null;
};

/** reviewsByTicket(), re-bucketed by Story — the unit the Reviews page
 *  actually renders one card per. A Sub-task's PRs are still their own
 *  reviewable unit (a stacked chain doesn't collapse into one row just
 *  because it shares a parent), but the parent-story attribution now
 *  reads as nesting instead of a repeated "under <story>" line on every
 *  sibling. */
export function reviewsByStory(snapshot: StatusSnapshotT): StoryReviewGroup[] {
  const byStory = new Map<string, StoryReviewGroup>();
  for (const ticketGroup of reviewsByTicket(snapshot)) {
    const key = ticketGroup.ticket.story.key;
    const group = byStory.get(key) ?? {
      feature: ticketGroup.feature,
      story: ticketGroup.ticket.story,
      tickets: [],
      oldestWaitDays: null,
    };
    group.tickets.push(ticketGroup);
    byStory.set(key, group);
  }

  for (const group of byStory.values()) {
    // The story's own ticket (if it has one) reads first, then its
    // Sub-tasks oldest-waiting-first — same thesis as the page overall,
    // scoped one level down.
    group.tickets.sort((a, b) => {
      if (a.ticket.isSubtask !== b.ticket.isSubtask) return a.ticket.isSubtask ? 1 : -1;
      return (b.oldestWaitDays ?? -1) - (a.oldestWaitDays ?? -1);
    });
    const waits = group.tickets.map((t) => t.oldestWaitDays).filter((d): d is number => d !== null);
    group.oldestWaitDays = waits.length > 0 ? Math.max(...waits) : null;
  }

  return [...byStory.values()].sort((a, b) => (b.oldestWaitDays ?? -1) - (a.oldestWaitDays ?? -1));
}
