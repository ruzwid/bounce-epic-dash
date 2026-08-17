// src/lib/schema.ts
import { z } from "zod";

export const WorkStatus = z.enum([
  "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo",
]);

export const Stage = z.enum([
  "not_started", "early", "underway", "nearly_done", "done",
]);

/** A reviewer's most recently *submitted* review on a PR — distinct from
 *  reviewRequests below, which is who's still being waited on. GitHub
 *  itself tracks a "dismissed" state too; this dashboard never fetches it
 *  since a dismissed review no longer counts toward the merge decision. */
export const PrReview = z.object({
  reviewer: z.string(),
  state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]),
});

export const PrRef = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string().url(),
  state: z.enum(["OPEN", "MERGED", "CLOSED"]),
  isDraft: z.boolean(),
  baseRef: z.string(),
  headRef: z.string(),
  /** true only if MERGED && baseRef === repo default branch */
  shippedToDefault: z.boolean(),
  mergedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  /** When the PR was opened — the timestamp every age in this dashboard is
   *  measured from. updatedAt moves on any comment, label or push, so a PR
   *  nobody has reviewed in a fortnight can report an age of hours; this
   *  one never moves. Null for snapshots written before it was published,
   *  where consumers fall back to updatedAt and say so. */
  createdAt: z.string().datetime().nullable().default(null),
  /** stack chain from this PR down to the master-based PR, if traced */
  stackChain: z.array(z.number()).default([]),
  reviewRequests: z.array(z.string()).default([]),
  /** One entry per reviewer who has submitted a review, their latest
   *  state only. Defaulted so snapshots written before this field existed
   *  still parse. */
  reviews: z.array(PrReview).default([]),
  /** GitHub login of whoever opened the PR. Nullable for a snapshot
   *  written before this field existed, or the rare deleted account. */
  author: z.string().nullable().default(null),
  /** never published: kept in raw.json only */
  filesTouched: z.array(z.string()).default([]),
});

/** Fields every tracked JIRA work item carries, at either level below a
 *  Feature. Split out so a Story and a Sub-task can't drift apart. */
const WorkItem = {
  key: z.string(),
  summary: z.string(),
  jiraStatus: z.string(),          // raw JIRA name
  status: WorkStatus,           // derived, GitHub-aware
  assignee: z.string().nullable(),
  updatedAt: z.string().datetime(),
  /** PRs matched to *this* ticket's own key. A Story does NOT absorb its
   *  sub-tasks' PRs here — use storyPrs() (src/lib/stories.ts) when you
   *  want the full evidence set, so the same PR is never stored twice and
   *  every PR keeps pointing at the ticket that actually owns it. */
  prs: z.array(PrRef).default([]),
};

/** A JIRA Sub-task: the leaf of the hierarchy
 *  (Epic > Milestone > Feature > Story > Sub-task).
 *
 *  Deliberately not a scoring unit. A Story split into seven sub-tasks and
 *  one with none both count once towards its Feature's score, so how finely
 *  somebody chose to decompose a ticket can never move a percentage. Their
 *  value is evidence: a sub-task's PRs are what prove its Story's status. */
export const Subtask = z.object(WorkItem);

/** A JIRA Story: the unit of work this dashboard scores.
 *
 *  Named `Story` because that is literally the JIRA issue type — the code
 *  used to call these "subtasks", which hid the fact that a level existed
 *  below them and that its pull requests were never being collected. */
export const Story = z.object({
  ...WorkItem,
  subtasks: z.array(Subtask).default([]),
});

export const AcCoverage = z.object({
  id: z.string(),                  // "ac-1"
  /** paraphrased, never the verbatim spec bullet */
  label: z.string(),
  coverage: z.enum(["covered", "partial", "no_signal"]),
  evidence: z.array(z.string()).default([]),   // story/sub-task keys / "repo#123"
});

export const ReleaseGate = z.object({
  integrationBranch: z.string(),
  pr: PrRef.nullable(),
  status: z.enum(["open", "merged", "not_found"]),
});

export const Callout = z.object({
  type: z.enum(["drift", "spec_gap", "release_blocked", "stalled"]),
  severity: z.enum(["info", "warn", "risk"]),
  message: z.string(),
  refs: z.array(z.string()).default([]),
});

export const Override = z.object({
  note: z.string(),
  author: z.string(),
  suppressStallWarning: z.boolean().default(false),
  expires: z.string().date(),
});

/** A milestone id, "M" followed by a number.
 *
 *  Deliberately a pattern rather than a fixed set: this used to be
 *  z.enum(["M1","M2","M3","M4"]) — the four milestones one epic happened
 *  to have — which meant a second epic couldn't have an M5, and the
 *  hardcoded union was copied into scripts/collect.ts as well. The
 *  M-and-a-number *shape* is still enforced, because it's what /m/:id
 *  slugs and featureAnchorId are built from. */
export const Milestone = z.string().regex(/^M\d+$/, "must be an M followed by a number, e.g. M1");

/** Snapshots written before Sub-tasks were collected call a Feature's
 *  Stories `subtasks`, and its KPI `subtasksTracked`. Those files are still
 *  read on every build — loadHistory() feeds all of them to the burn-up
 *  chart — so the rename is tolerated on read rather than breaking every
 *  snapshot ever written. New snapshots are schemaVersion 2. */
function renameLegacy<T extends Record<string, unknown>>(from: string, to: string) {
  return (raw: unknown): unknown => {
    if (raw && typeof raw === "object" && !(to in raw) && from in raw) {
      const { [from]: legacy, ...rest } = raw as T;
      return { ...rest, [to]: legacy };
    }
    return raw;
  };
}

export const Feature = z.preprocess(renameLegacy("subtasks", "stories"), z.object({
  key: z.string(),                 // BOUN-11207
  code: z.string(),                // "F1.1"
  title: z.string(),
  milestone: Milestone,
  tier: z.enum(["full", "light"]),
  owner: z.string(),               // display name
  repos: z.array(z.string()),
  /** The ticket's own "Goal" prose, extracted verbatim from the JIRA
   *  description — what the work is for, as opposed to `rationale`, which
   *  is the judge's read on how far along it is. Empty when the ticket has
   *  no such section. */
  overview: z.string().default(""),

  stage: Stage,
  /** deterministic weighted score, rounded to 5 */
  score: z.number().int().min(0).max(100),
  scoreBasis: z.object({
    shipped: z.number(), doneUnverified: z.number().default(0), staged: z.number(), inReview: z.number(),
    inProgress: z.number(), blocked: z.number(), todo: z.number(),
    total: z.number(),
  }),
  /** set only if the judge overrode the computed score */
  scoreOverride: z.object({ value: z.number(), reason: z.string() }).nullable(),

  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string(),           // LLM, must distinguish shipped vs staged

  daysSinceLastActivity: z.number().nullable(),
  daysInStaged: z.number().nullable(),
  releaseGate: ReleaseGate.nullable(),

  acCoverage: z.array(AcCoverage).default([]),
  stories: z.array(Story).default([]),
  callouts: z.array(Callout).default([]),
  override: Override.nullable(),
  dataOk: z.boolean(),             // false → render "unavailable", not 0%

  /** Product has approved this feature — under the current flow, the
   *  feature ticket reached Done by passing through Product Review. This
   *  is what lets `stage` read "done" while stories are still open (see
   *  deriveStage in src/lib/score.ts), so it has to be published: without
   *  it the UI can only infer sign-off from that contradiction.
   *  Defaulted for snapshots written before it was published. */
  signedOff: z.boolean().default(false),
  /** In Product Review right now — engineering is finished, product owes
   *  a decision. Mutually exclusive with signedOff by construction. */
  awaitingSignOff: z.boolean().default(false),
}));

export const ReviewRequest = z.object({
  pr: PrRef,
  featureKey: z.string().nullable(),
  reviewer: z.string(),
  /** GitHub's GraphQL API exposes no review-request timestamp, so this is
   *  the PR's last-activity time — kept because "last touched" is worth
   *  showing, but never used as an age: see ageDays. */
  requestedAt: z.string().datetime(),
  /** How long the PR has been open, measured from PrRef.createdAt against
   *  the snapshot's own generatedAt — not from requestedAt, which any
   *  comment resets, and not against the reader's clock, which would age a
   *  historical snapshot every time someone opened it. Falls back to
   *  requestedAt for snapshots written before createdAt was published. */
  ageDays: z.number(),
  /** Whether ageDays could be measured from the PR's real open date. False
   *  means it fell back to requestedAt and understates the wait. */
  ageFromOpen: z.boolean().default(false),
});

export const CollectionError = z.object({
  source: z.enum(["jira", "github", "judge"]),
  scope: z.string(),               // ticket key / repo / "all"
  message: z.string(),
});

/** A milestone as published: identity plus the ticket's own description.
 *  Progress is never stored here — it's derived from the features that
 *  belong to it, so the two can't drift apart. */
export const MilestoneSummary = z.object({
  id: Milestone,
  key: z.string(),
  title: z.string(),
  tier: z.enum(["full", "light"]),
  owner: z.string(),
  overview: z.string().default(""),
  /** Milestones sharing a `group` render as one sidebar section and one
   *  milestone-filter chip — WPP at Scale's M3 and M4 are one owner's
   *  platform build and are always read together. Comes from config.yaml;
   *  null (the default) means the milestone is its own group. Published
   *  rather than re-derived so a historical snapshot keeps the grouping it
   *  was collected under. */
  group: z.string().nullable().default(null),
});

export const StatusSnapshot = z.object({
  /** 1: Feature.subtasks held Stories, and Sub-tasks were never collected.
   *  2: Feature.stories, each with its own Sub-tasks. Both parse — see
   *  renameLegacy above.
   *  3: Feature.signedOff / awaitingSignOff are published. The version is
   *  what lets the since-yesterday diff tell "product approved this
   *  overnight" apart from "the previous snapshot predates the field and
   *  defaulted it to false" — see hasSignOffData in dashboard/diff.ts.
   *  4: the dashboard tracks more than one epic. epic.slug and
   *  MilestoneSummary.group are published; snapshots live under
   *  data/snapshots/<slug>/ instead of directly in data/snapshots/. */
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  /** logical Europe/Dublin date, YYYY-MM-DD — the file name */
  date: z.string().date(),
  generatedAt: z.string().datetime(),
  epic: z.object({
    key: z.string(),
    title: z.string(),
    targetDate: z.string().date().nullable(),
    overview: z.string().default(""),
    /** Which epic this snapshot belongs to — the epics.yaml slug, and the
     *  directory it was written into. Defaulted to "" for the snapshots
     *  written before the dashboard tracked more than one epic; the loader
     *  reads the slug off the path either way, so this is provenance
     *  carried inside the file rather than the lookup key. */
    slug: z.string().default(""),
  }),

  /** Defaulted, so snapshots written before milestones were published
   *  still parse — the UI falls back to grouping by feature.milestone. */
  milestones: z.array(MilestoneSummary).default([]),

  headline: z.object({
    featuresWithNothingOnMaster: z.number(),
    totalFeatures: z.number(),
    sentence: z.string(),
  }),

  kpis: z.preprocess(renameLegacy("subtasksTracked", "storiesTracked"), z.object({
    featuresTracked: z.number(),
    lightTierMilestones: z.number(),
    /** Stories, not sub-tasks — the scoring unit. Sub-tasks are evidence
     *  and are deliberately not counted here (see Subtask in this file). */
    storiesTracked: z.number(),
    shipped: z.number(),
    /** JIRA Done, but no PR proves the code reached master — see
     *  src/lib/classify.ts's deriveWorkStatus. Defaulted to 0 so snapshots
     *  written before this field existed still parse. */
    doneUnverified: z.number().default(0),
    staged: z.number(),
    inReview: z.number(),
    /** Split out from blockedOrTodo below, which fused the one status that
     *  means "someone needs help" with the one that means "not started".
     *  Defaulted for snapshots written before the split — read them through
     *  storyTotals() (src/lib/dashboard/totals.ts), which sums the features
     *  and is therefore right for every schema version. */
    inProgress: z.number().default(0),
    blocked: z.number().default(0),
    todo: z.number().default(0),
    /** Kept so older snapshots keep parsing, and because "not shipped and
     *  not moving" is still a figure worth having. Never rendered on its
     *  own any more. */
    blockedOrTodo: z.number(),
  })),

  features: z.array(Feature),
  reviewQueue: z.array(ReviewRequest),
  collectionErrors: z.array(CollectionError).default([]),
});

export const Judgment = z.object({
  schemaVersion: z.literal(1),
  date: z.string().date(),
  features: z.array(z.object({
    featureKey: z.string(),
    rationale: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    acCoverage: z.array(AcCoverage),
    callouts: z.array(Callout),
    scoreOverride: z.object({ value: z.number(), reason: z.string() }).nullable(),
  })),
});

export type StatusSnapshot = z.infer<typeof StatusSnapshot>;