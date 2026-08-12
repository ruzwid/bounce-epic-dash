// src/lib/config-schema.ts
// Zod schemas describing the shape of config.yaml and overrides.yaml.
// Kept separate from config.ts so the shape is easy to scan on its own.
import { z } from "zod";
import { Milestone as MilestoneId, Override, SubtaskStatus } from "./schema.ts";

export const MilestoneFeature = z.object({
  key: z.string(),
  code: z.string(),
  owner: z.string(),
  repos: z.array(z.string()).default([]),
});

export const Milestone = z.object({
  id: MilestoneId,
  title: z.string(),
  tier: z.enum(["full", "light"]),
  owner: z.string(),
  /** milestone's own JIRA key, used when subtasks live directly under it
   *  instead of under child feature tickets. Null is allowed here — it's
   *  only an error if collect.ts is asked to use it while features[] is
   *  also empty (see scripts/collect.ts). */
  ticket: z.string().nullable().default(null),
  /** fallback repos for direct-subtask mode, or a milestone-wide default */
  repos: z.array(z.string()).default([]),
  features: z.array(MilestoneFeature).default([]),
});

export const ScoreWeights = z.object({
  shipped: z.number(),
  staged: z.number(),
  in_review: z.number(),
  in_progress: z.number(),
  blocked: z.number(),
  todo: z.number(),
});

export const JiraConfig = z.object({
  projectKey: z.string(),
  /** raw JIRA status name -> SubtaskStatus. Unmapped names fall back to
   *  "todo" with a console warning at collection time. */
  statusMap: z.record(z.string(), SubtaskStatus).default({}),
});

export const GithubConfig = z.object({
  org: z.string(),
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
});

export type Config = z.infer<typeof Config>;
export type Milestone = z.infer<typeof Milestone>;
export type MilestoneFeature = z.infer<typeof MilestoneFeature>;

/** overrides.yaml: ticket key -> Override (imported verbatim from schema.ts) */
export const OverridesFile = z.record(z.string(), Override);
export type OverridesFile = z.infer<typeof OverridesFile>;
