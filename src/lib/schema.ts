// src/lib/schema.ts
import { z } from "zod";

export const SubtaskStatus = z.enum([
  "shipped", "staged", "in_review", "in_progress", "blocked", "todo",
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

export const Subtask = z.object({
  key: z.string(),
  summary: z.string(),
  jiraStatus: z.string(),          // raw JIRA name
  status: SubtaskStatus,           // derived, GitHub-aware
  assignee: z.string().nullable(),
  updatedAt: z.string().datetime(),
  prs: z.array(PrRef).default([]),
});

export const AcCoverage = z.object({
  id: z.string(),                  // "ac-1"
  /** paraphrased, never the verbatim spec bullet */
  label: z.string(),
  coverage: z.enum(["covered", "partial", "no_signal"]),
  evidence: z.array(z.string()).default([]),   // subtask keys / "repo#123"
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

export const Feature = z.object({
  key: z.string(),                 // BOUN-11207
  code: z.string(),                // "F1.1"
  title: z.string(),
  milestone: z.enum(["M1", "M3", "M4"]),
  tier: z.enum(["full", "light"]),
  owner: z.string(),               // display name
  repos: z.array(z.string()),

  stage: Stage,
  /** deterministic weighted score, rounded to 5 */
  score: z.number().int().min(0).max(100),
  scoreBasis: z.object({
    shipped: z.number(), staged: z.number(), inReview: z.number(),
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
  subtasks: z.array(Subtask).default([]),
  callouts: z.array(Callout).default([]),
  override: Override.nullable(),
  dataOk: z.boolean(),             // false → render "unavailable", not 0%
});

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

export const StatusSnapshot = z.object({
  schemaVersion: z.literal(1),
  /** logical Europe/Dublin date, YYYY-MM-DD — the file name */
  date: z.string().date(),
  generatedAt: z.string().datetime(),
  epic: z.object({ key: z.string(), title: z.string(), targetDate: z.string().date().nullable() }),

  headline: z.object({
    featuresWithNothingOnMaster: z.number(),
    totalFeatures: z.number(),
    sentence: z.string(),
  }),

  kpis: z.object({
    featuresTracked: z.number(),
    lightTierMilestones: z.number(),
    subtasksTracked: z.number(),
    shipped: z.number(),
    staged: z.number(),
    inReview: z.number(),
    blockedOrTodo: z.number(),
  }),

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