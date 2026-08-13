// src/lib/config-schema.ts
// Zod schemas describing the shape of config.yaml and overrides.yaml.
// Kept separate from config.ts so the shape is easy to scan on its own.
import { z } from "zod";
import { Milestone as MilestoneId, Override, WorkStatus } from "./schema.ts";

export const MilestoneFeature = z.object({
  key: z.string(),
  code: z.string(),
  owner: z.string(),
});

export const Milestone = z.object({
  id: MilestoneId,
  title: z.string(),
  tier: z.enum(["full", "light"]),
  owner: z.string(),
  /** milestone's own JIRA key, used when stories live directly under it
   *  instead of under child feature tickets. Null is allowed here — it's
   *  only an error if collect.ts is asked to use it while features[] is
   *  also empty (see scripts/collect.ts). */
  ticket: z.string().nullable().default(null),
  features: z.array(MilestoneFeature).default([]),
});

export const ScoreWeights = z.object({
  shipped: z.number(),
  done_unverified: z.number(),
  staged: z.number(),
  in_review: z.number(),
  in_progress: z.number(),
  blocked: z.number(),
  todo: z.number(),
});

export const JiraConfig = z.object({
  projectKey: z.string(),
  /** raw JIRA status name -> WorkStatus. Unmapped names fall back to
   *  "todo" with a console warning at collection time. */
  statusMap: z.record(z.string(), WorkStatus).default({}),
});

export const GithubConfig = z.object({
  org: z.string(),
  /**
   * Repos are discovered from the org on every run — every non-archived
   * repo pushed since epic.startDate — rather than listed per feature.
   * Which repo a ticket's PR lands in isn't knowable in advance, and a
   * hand-maintained list silently drops the PRs it doesn't mention.
   *
   * These two are escape hatches, not the mechanism:
   *   excludeRepos — never crawl (noisy infra repos, vendored mirrors)
   *   includeRepos — always crawl, even if it hasn't been pushed since
   *                  startDate (a repo that only gets release commits)
   */
  excludeRepos: z.array(z.string()).default([]),
  includeRepos: z.array(z.string()).default([]),
});

export const EpicConfig = z.object({
  key: z.string(),
  title: z.string(),
  /** PR search floor */
  startDate: z.string().date(),
  targetDate: z.string().date().nullable(),
});

export const Config = z.object({
  epic: EpicConfig,
  jira: JiraConfig,
  github: GithubConfig,
  timezone: z.string(),
  scoreWeights: ScoreWeights,
  milestones: z.array(Milestone),
  /** login -> display name */
  people: z.record(z.string(), z.string()).default({}),
  /** JIRA assignee `displayName` -> login */
  jiraAssignees: z.record(z.string(), z.string()).default({}),
  /** login -> hex, the average colour of their GitHub avatar. Precomputed
   *  (see scripts/avatar-colors.mjs), not derived at runtime. */
  peopleColors: z.record(z.string(), z.string()).default({}),
});

export type Config = z.infer<typeof Config>;
export type Milestone = z.infer<typeof Milestone>;
export type MilestoneFeature = z.infer<typeof MilestoneFeature>;

/** overrides.yaml: ticket key -> Override (imported verbatim from schema.ts) */
export const OverridesFile = z.record(z.string(), Override);
export type OverridesFile = z.infer<typeof OverridesFile>;
