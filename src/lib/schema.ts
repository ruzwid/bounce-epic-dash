// src/lib/schema.ts
import { z } from "zod";

export const WorkStatus = z.enum([
  "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo",
]);

export const Stage = z.enum([
  "not_started", "early", "underway", "nearly_done", "done",
]);

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
  /** stack chain from this PR down to the master-based PR, if traced */
  stackChain: z.array(z.number()).default([]),
  reviewRequests: z.array(z.string()).default([]),
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

export const Milestone = z.enum(["M1", "M2", "M3", "M4"]);

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
}));

export const ReviewRequest = z.object({
  pr: PrRef,
  featureKey: z.string().nullable(),
  reviewer: z.string(),
  requestedAt: z.string().datetime(),
  ageDays: z.number(),
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
});

export const StatusSnapshot = z.object({
  /** 1: Feature.subtasks held Stories, and Sub-tasks were never collected.
   *  2: Feature.stories, each with its own Sub-tasks. Both parse — see
   *  renameLegacy above. */
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  /** logical Europe/Dublin date, YYYY-MM-DD — the file name */
  date: z.string().date(),
  generatedAt: z.string().datetime(),
  epic: z.object({
    key: z.string(),
    title: z.string(),
    targetDate: z.string().date().nullable(),
    overview: z.string().default(""),
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