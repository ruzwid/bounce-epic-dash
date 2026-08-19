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
import { storyTotals, weightedPercent } from "./totals.ts";
import { featureAnchorId } from "./anchors.ts";
import { groupSlug, milestoneGroupSlug, needsAttention, prOpenDays } from "./search.ts";
import { storyPrs } from "../stories.ts";
import { BOT_ICONS } from "./botIcons.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StoryT = z.infer<typeof StorySchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;
type StageT = z.infer<typeof StageSchema>;

/** "F1.1" -> "f1-1", "DF4.1.1" -> "df4-1-1". Shared with the in-page
 *  anchor ids so a feature has exactly one slug in the whole app. */
export { featureAnchorId as featureSlug } from "./anchors.ts";

/**
 * A feature's title with its own code stripped off the front.
 *
 * Titles arrive from JIRA already prefixed with the code, in whichever of
 * three punctuations the author used ("F1.1 — x", "F2.7 - x", "F2.8 x").
 * Every row that shows the code in its own column strips it here rather
 * than printing "F2.7  F2.7 - x". Anchored and regex-escaped: a code that
 * appears *inside* a title is part of the sentence, not a prefix.
 *
 * Falls back to the untouched title when stripping would leave nothing —
 * a feature whose title is only its code still needs something to show.
 */
export function featureTitleWithoutCode(feature: { title: string; code: string }): string {
  const escaped = feature.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return feature.title.replace(new RegExp(`^\\s*${escaped}\\s*[—–:-]?\\s*`), "").trim() || feature.title;
}

/**
 * True when a "story" is really the feature's own ticket standing in for
 * one.
 *
 * A feature with no child Stories in JIRA — its pull requests hang off the
 * feature ticket directly — is collected with the parent ticket as a
 * single story-equivalent, matching PRs against the feature's own key (see
 * scripts/collect.ts). It therefore carries the feature's key, title and
 * status.
 *
 * Any view that nests stories under their feature has to skip that rung,
 * or the feature prints twice: once properly, and once as a child row
 * whose title — stripped of the duplicated feature title — is empty. The
 * work belongs directly under the feature, because that is where JIRA
 * put it.
 */
export function isFeatureTicket(story: { key: string }, feature: { key: string }): boolean {
  return story.key === feature.key;
}

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
  /** Every Milestone id ("M1", or ["M3","M4"] for a merged group) this
   *  heading represents a page for — one ShellLink per id, since two
   *  milestones sharing a heading are still two separate tickets. */
  milestoneIds: string[];
};

/**
 * One group per milestone, in the order the snapshot lists them, with
 * milestones sharing a `group` folded together.
 *
 * The grouping comes from each epic's config.yaml (`group: m3-m4` on WPP at
 * Scale's M3 and M4, one owner's platform build always read together). It
 * used to be a hardcoded ["M3","M4"] here, which was invisible from the
 * config and which a second epic could not have inherited or opted out of.
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
    const emitted = new Set<string>();

    // Resolved through milestoneGroupSlug so the sidebar's sections and the
    // milestone filter's chips are the same set, decided once — including
    // its fallback to the epic's current config for snapshots written
    // before grouping was published.
    const keyOf = (m: StatusSnapshotT["milestones"][number]) => milestoneGroupSlug(snapshot, m.id);

    for (const milestone of snapshot.milestones) {
      // A milestone with no group of its own is a group of one, keyed by
      // its own id, so the two cases share this whole code path.
      const groupKey = keyOf(milestone);
      if (emitted.has(groupKey)) continue;
      emitted.add(groupKey);

      const members = snapshot.milestones.filter((m) => keyOf(m) === groupKey);
      const ids = members.map((m) => m.id);
      // A single milestone is named by its title; a merged group is named
      // by its shared owner, because the members' titles are different
      // things and concatenating them reads as noise in a 264px rail.
      const suffix =
        members.length === 1 ? stripMilestonePrefix(members[0]!) : (members[0]?.owner ?? groupKey);

      groups.push({
        id: groupKey,
        label: `${ids.join(" / ")} · ${suffix}`,
        suffix,
        overview: members.map((m) => m.overview).filter(Boolean).join("\n\n"),
        features: featuresFor(ids),
        milestoneIds: ids,
      });
    }
    return groups.filter((group) => group.features.length > 0);
  }

  // No published milestones: derive the groups from the features
  // themselves, in the order they appear. No titles are available, so the
  // id stands in for one — better than a hardcoded guess at what "M2"
  // was called in whichever epic this snapshot came from.
  return [...new Set(snapshot.features.map((f) => f.milestone))].map((id) => ({
    id: groupSlug(id),
    label: id,
    suffix: "",
    overview: "",
    features: featuresFor([id]),
    milestoneIds: [id],
  }));
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
    // The id itself when the snapshot predates published milestones — a
    // hardcoded per-id title map used to stand in here, which was only
    // ever right for the one epic it was written for.
    title: summary ? stripMilestonePrefix(summary) : id,
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
export function milestoneProgress(epic: string, features: FeatureT[]): MilestoneProgress {
  const totals = storyTotals(features);
  const score = weightedPercent(epic, totals);
  const allDone = features.length > 0 && features.every((f) => f.stage === "done");

  return {
    score,
    // allDone is passed as both the shipped-check and the signed-off
    // override: an ordinary all-done milestone already scores 100 (so the
    // 2-arg call already returned "done"), but a milestone whose lone
    // feature reached "done" via product sign-off (score < 100) needs the
    // override arg too, or deriveStage falls back to the score bands and
    // refuses to report the milestone itself as done.
    stage: deriveStage(score, allDone, allDone),
    shipped: totals.shipped,
    doneUnverified: totals.doneUnverified,
    staged: totals.staged,
    inReview: totals.inReview,
    blockedOrTodo: totals.blocked + totals.todo,
    storiesTracked: totals.total,
  };
}

/** Milestone ids with anything left to do — every id *except* one whose
 *  features have all reached stage "done" (the same allDone check
 *  milestoneProgress uses for its own stage, so this can never disagree
 *  with a milestone page reading itself as finished). The People page uses
 *  this to default to hiding a finished milestone's people and work, which
 *  otherwise pads every card with a feature nobody needs to look at any
 *  more — M1 fully signed off shouldn't keep printing on everyone's card
 *  forever. */
export function activeMilestones(snapshot: StatusSnapshotT): Set<string> {
  const byMilestone = new Map<string, FeatureT[]>();
  for (const feature of snapshot.features) {
    const list = byMilestone.get(feature.milestone) ?? [];
    list.push(feature);
    byMilestone.set(feature.milestone, list);
  }
  const active = new Set<string>();
  for (const [id, features] of byMilestone) {
    if (milestoneProgress(snapshot.epic.slug, features).stage !== "done") active.add(id);
  }
  return active;
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

/** Why a feature is on the attention list, spelled out. needsAttention()
 *  answers yes/no; this answers "because of what", using the same
 *  thresholds so the two can never disagree. */
export function attentionReasons(feature: FeatureT, asOf: Date): AttentionReason[] {
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

  // storyPrs, not story.prs: needsAttention() counts a sub-task's PRs too,
  // and this function's whole contract is that it explains that decision
  // rather than reaching a different one.
  const waiting = feature.stories.flatMap((story) =>
    storyPrs(story).filter(
      (pr) => pr.state === "OPEN" && pr.reviewRequests.length > 0 && prOpenDays(pr, asOf) > REVIEW_WAIT_DAYS,
    ),
  );
  if (waiting.length > 0) {
    const oldest = Math.max(...waiting.map((pr) => Math.floor(prOpenDays(pr, asOf))));
    reasons.push({
      kind: "review_wait",
      detail: `${waiting.length} PR${waiting.length === 1 ? "" : "s"} open for review, oldest ${oldest}d`,
    });
  }

  for (const callout of feature.callouts) {
    reasons.push({ kind: "callout", detail: callout.message });
  }

  return reasons;
}

/** done_unverified stories that only read as fine because their feature
 *  was signed off by product (see src/lib/score.ts's deriveStage) — a
 *  feature can only reach stage "done" with a done_unverified story still
 *  in it via that override; the ordinary "done" path requires every story
 *  literally shipped. Surfaced separately, collapsed by default, so
 *  they're checkable without being a per-run distraction. */
export function signedOffUnverifiedStories(snapshot: StatusSnapshotT): { feature: FeatureT; story: StoryT }[] {
  return snapshot.features
    .filter((f) => f.stage === "done")
    .flatMap((feature) =>
      feature.stories.filter((story) => story.status === "done_unverified").map((story) => ({ feature, story })),
    );
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

/** Epic-level completion across every tracked story, on config.yaml's own
 *  scoreWeights — the same weights as a single feature's score
 *  (src/lib/score.ts), so editing a weight moves the header figure and the
 *  feature bars underneath it together. It used to hardcode 1/1/0.5/0.3
 *  here and omit in_progress entirely, which meant this number quietly
 *  ignored config and disagreed with every bar on the page below it.
 *
 *  Deliberately *not* the mean of feature scores — that would weight a
 *  one-story feature the same as a fourteen-story one. */
export function epicProgress(epic: string, features: FeatureT[]): EpicProgress {
  const totals = storyTotals(features);
  if (totals.total === 0) {
    return { percent: 0, shippedShare: 0, doneUnverifiedShare: 0, stagedShare: 0, inReviewShare: 0 };
  }
  return {
    percent: weightedPercent(epic, totals),
    shippedShare: (totals.shipped / totals.total) * 100,
    doneUnverifiedShare: (totals.doneUnverified / totals.total) * 100,
    stagedShare: (totals.staged / totals.total) * 100,
    inReviewShare: (totals.inReview / totals.total) * 100,
  };
}

/** The epic's own Stage, on the same 0/25/70/100 bands and "done only if
 *  every feature actually shipped" rule as a feature or milestone — so
 *  the epic's Jira link icon (Sidebar) reads the same six-hue language as
 *  everything nested under it. */
export function epicStage(snapshot: StatusSnapshotT): StageT {
  const { percent } = epicProgress(snapshot.epic.slug, snapshot.features);
  const allDone = snapshot.features.length > 0 && snapshot.features.every((f) => f.stage === "done");
  // Same reasoning as milestoneProgress() above: allDone doubles as the
  // signed-off override so a signed-off feature's "done" status can carry
  // all the way up to the epic even when the epic's weighted percent is
  // still below 100.
  return deriveStage(percent, allDone, allDone);
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

export type ReviewerState = "requested" | "approved" | "changes_requested" | "commented";

export type ReviewerStatus = {
  reviewer: string;
  state: ReviewerState;
  /** How long the PR has been open, in days — only meaningful when state
   *  is "requested"; a submitted review has no tracked age. Not "days
   *  since the request": GitHub exposes no such timestamp, and the
   *  last-activity proxy that stood in for one reset to zero on every
   *  comment. See ReviewRequest.ageDays in src/lib/schema.ts. */
  ageDays: number | null;
};

export type PrReviewStatus = {
  pr: PrRefT;
  /** Everyone with a stake in this PR: anyone still being waited on, plus
   *  anyone who's already submitted a review, one entry per person. A
   *  reviewer re-requested after leaving a review shows as "requested" —
   *  GitHub treats their prior review as stale the moment new commits go
   *  up, and so does this. Empty when the PR is open but nobody's been
   *  asked and nobody's reviewed it yet. */
  reviewers: ReviewerStatus[];
};

/** Merges a PR's still-pending requests with its submitted reviews into
 *  one status per person — see PrReviewStatus.reviewers above for why a
 *  pending re-request wins over a stale prior review.
 *
 *  `waitingOn` is optional: the Reviews page passes it from
 *  snapshot.reviewQueue, whose ageDays is frozen at snapshot-generation
 *  time (see merge.ts) rather than drifting with however long it's been
 *  since the page was loaded. A caller with only a bare PrRef (no
 *  snapshot in scope, e.g. StoryCard) omits it and gets the same pending
 *  reviewers straight off pr.reviewRequests, just without an age — every
 *  card on this dashboard already treats "no age" as "don't show one"
 *  rather than inventing a number. */
export function reviewersForPr(
  pr: PrRefT,
  waitingOn?: { reviewer: string; ageDays: number }[],
): ReviewerStatus[] {
  const byReviewer = new Map<string, ReviewerStatus>();
  if (waitingOn) {
    for (const w of waitingOn) {
      byReviewer.set(w.reviewer, { reviewer: w.reviewer, state: "requested", ageDays: w.ageDays });
    }
  } else {
    for (const login of pr.reviewRequests) {
      byReviewer.set(login, { reviewer: login, state: "requested", ageDays: null });
    }
  }
  for (const r of pr.reviews) {
    if (byReviewer.has(r.reviewer)) continue;
    const state: ReviewerState =
      r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "changes_requested" : "commented";
    byReviewer.set(r.reviewer, { reviewer: r.reviewer, state, ageDays: null });
  }
  return [...byReviewer.values()];
}

/** Bots first, then alphabetical: reviewer order in the underlying data is
 *  whatever order requests/reviews landed in on that specific PR, so two
 *  PRs with the same two reviewers could otherwise show them swapped. A
 *  fixed sort key makes the same person land in the same slot on every row
 *  of every page that draws these badges. */
export function orderReviewers<T extends { reviewer: string }>(reviewers: T[]): T[] {
  return [...reviewers].sort((a, b) => {
    const botDiff = Number(!(a.reviewer in BOT_ICONS)) - Number(!(b.reviewer in BOT_ICONS));
    return botDiff !== 0 ? botDiff : a.reviewer.localeCompare(b.reviewer);
  });
}

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
    group.prs.push({ pr, reviewers: reviewersForPr(pr, waitingByPr.get(`${pr.repo}#${pr.number}`) ?? []) });
    groups.set(ticket.key, group);
  }

  for (const group of groups.values()) {
    const waits = group.prs.flatMap((p) =>
      p.reviewers.filter((r) => r.state === "requested" && r.ageDays !== null).map((r) => r.ageDays!),
    );
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
