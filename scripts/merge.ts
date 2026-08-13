#!/usr/bin/env tsx
// scripts/merge.ts
// The trust boundary. data/judgment/<date>.json is written by a Claude Code
// routine (.claude/skills/judge/SKILL.md) — treat it as untrusted input.
// This script validates it strictly against that day's pending file (the
// judge's own input, so it's the whitelist of everything the judge was
// allowed to reference), merges in non-expired overrides.yaml entries, and
// writes a schema-valid, publication-safe snapshot. Any validation failure
// exits non-zero and writes nothing — never a partial/silent snapshot.
import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import type { z } from "zod";
import { loadConfig, loadOverrides, logicalDate } from "../src/lib/config.ts";
import type { Config, OverridesFile } from "../src/lib/config-schema.ts";
import { writeJsonAtomic } from "../src/lib/io.ts";
import { deriveStage } from "../src/lib/score.ts";
import { storyPrs } from "../src/lib/stories.ts";
import {
  Judgment,
  StatusSnapshot,
  type Callout as CalloutSchema,
  type CollectionError as CollectionErrorSchema,
  type Feature as FeatureSchema,
  type PrRef as PrRefSchema,
  type ReviewRequest as ReviewRequestSchema,
} from "../src/lib/schema.ts";
import type { PendingFile, RawFeature, RawFile, RawMilestone, RawPrRecord } from "./collect.ts";

type JudgmentT = z.infer<typeof Judgment>;
type FeatureT = z.infer<typeof FeatureSchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type ReviewRequestT = z.infer<typeof ReviewRequestSchema>;
type CollectionErrorT = z.infer<typeof CollectionErrorSchema>;
type CalloutT = z.infer<typeof CalloutSchema>;

export type ValidateResult = { ok: true; value: JudgmentT } | { ok: false; reason: string };

/** Every story key or "repo#number" PR ref that appeared in pending.json
 *  for one feature — the whitelist a callout.refs entry (or acCoverage
 *  evidence, though that's not currently cross-checked beyond ids) must be
 *  drawn from. */
function refWhitelistFor(pf: PendingFile["features"][number]): Set<string> {
  const refs = new Set<string>([pf.key]);
  for (const s of pf.stories) {
    refs.add(s.key);
    // Sub-tasks are legitimate evidence — the judge sees them in
    // pending.json, so citing one must not read as an invented reference.
    for (const sub of s.subtasks) refs.add(sub.key);
  }
  for (const p of pf.prs) refs.add(p.ref);
  return refs;
}

/** Validates judgment.json as untrusted input: schema-valid AND every
 *  reference it makes (featureKey, acCoverage id, callout ref) must already
 *  exist in that day's pending.json — the judge cannot invent tickets, PRs,
 *  or percentages, and a scoreOverride needs a reason and must stay within
 *  20 points of the computed score. */
export function validateJudgment(judgmentRaw: unknown, pending: PendingFile): ValidateResult {
  const parsed = Judgment.safeParse(judgmentRaw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `judgment.json is not schema-valid:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
    };
  }

  const pendingByKey = new Map(pending.features.map((f) => [f.key, f]));

  for (const jf of parsed.data.features) {
    const pf = pendingByKey.get(jf.featureKey);
    if (!pf) {
      return { ok: false, reason: `judgment.json references featureKey "${jf.featureKey}" which is not in pending.json for this date — invented reference.` };
    }

    const acIds = new Set(pf.acBullets.map((b) => b.id));
    const refWhitelist = refWhitelistFor(pf);

    for (const ac of jf.acCoverage) {
      if (!acIds.has(ac.id)) {
        return { ok: false, reason: `judgment.json for ${jf.featureKey} references acCoverage id "${ac.id}" which is not in pending.json's AC bullets for that feature — invented reference.` };
      }
      for (const ref of ac.evidence) {
        if (!refWhitelist.has(ref)) {
          return { ok: false, reason: `judgment.json for ${jf.featureKey} has acCoverage "${ac.id}" citing evidence "${ref}", which is not a story key or PR ref in pending.json for that feature — invented reference.` };
        }
      }
    }

    for (const callout of jf.callouts) {
      for (const ref of callout.refs) {
        if (!refWhitelist.has(ref)) {
          return { ok: false, reason: `judgment.json for ${jf.featureKey} has a callout referencing "${ref}", which is not a story key or PR ref in pending.json for that feature — invented reference.` };
        }
      }
    }

    if (jf.scoreOverride) {
      if (!jf.scoreOverride.reason || jf.scoreOverride.reason.trim().length === 0) {
        return { ok: false, reason: `judgment.json for ${jf.featureKey} has a scoreOverride with no reason.` };
      }
      const deviation = Math.abs(jf.scoreOverride.value - pf.score);
      if (deviation > 20) {
        return { ok: false, reason: `judgment.json for ${jf.featureKey} has a scoreOverride (${jf.scoreOverride.value}) deviating ${deviation} points from the computed score (${pf.score}) — more than the 20-point limit.` };
      }
    }
  }

  return { ok: true, value: parsed.data };
}

/** filesTouched is only ever meant for data/raw/*.json — every PrRef that
 *  ends up in a published snapshot gets it emptied out here. */
function sanitizePrRef(pr: RawPrRecord): PrRefT {
  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    baseRef: pr.baseRef,
    headRef: pr.headRef,
    shippedToDefault: pr.shippedToDefault,
    mergedAt: pr.mergedAt,
    updatedAt: pr.updatedAt,
    stackChain: pr.stackChain,
    reviewRequests: pr.reviewRequests,
    filesTouched: [],
  };
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)));
}

function isExpired(expires: string, timezone: string, now: Date): boolean {
  return logicalDate(timezone, now) > expires;
}

export function buildSnapshot(params: {
  date: string;
  epic: { key: string; title: string; targetDate: string | null; overview?: string };
  /** Defaulted so a raw file written before milestones were collected
   *  still merges — the snapshot simply publishes an empty list. */
  milestones?: RawMilestone[];
  rawFeatures: RawFeature[];
  judgment: JudgmentT;
  overrides: OverridesFile;
  now: Date;
  timezone: string;
  collectionErrors: CollectionErrorT[];
  people: Record<string, string>;
}): z.infer<typeof StatusSnapshot> {
  const { date, epic, milestones = [], rawFeatures, judgment, overrides, now, timezone, collectionErrors, people } = params;
  const judgmentByKey = new Map(judgment.features.map((f) => [f.featureKey, f]));

  const features: FeatureT[] = rawFeatures.map((raw) => {
    const jf = judgmentByKey.get(raw.key);
    const override = overrides[raw.key];
    const activeOverride = override && !isExpired(override.expires, timezone, now) ? override : null;

    let callouts: CalloutT[] = jf?.callouts ?? [];
    if (activeOverride?.suppressStallWarning) {
      callouts = callouts.filter((c) => c.type !== "stalled");
    }

    const scoreOverride = jf?.scoreOverride ?? null;
    const effectiveScore = scoreOverride ? scoreOverride.value : raw.score;
    const allShippedToDefault = raw.stories.length > 0 && raw.stories.every((s) => s.status === "shipped");
    const stage = deriveStage(effectiveScore, allShippedToDefault, raw.signedOff);

    return {
      key: raw.key,
      code: raw.code,
      title: raw.title,
      milestone: raw.milestone,
      tier: raw.tier,
      owner: people[raw.owner] ?? raw.owner,
      repos: raw.repos,
      overview: raw.overview ?? "",
      stage,
      score: raw.score,
      scoreBasis: raw.scoreBasis,
      scoreOverride,
      confidence: jf?.confidence ?? "low",
      rationale: jf?.rationale ?? "No judgment was provided for this feature.",
      daysSinceLastActivity: raw.daysSinceLastActivity,
      daysInStaged: raw.daysInStaged,
      releaseGate: raw.releaseGate
        ? {
            integrationBranch: raw.releaseGate.integrationBranch,
            pr: raw.releaseGate.pr ? sanitizePrRef(raw.releaseGate.pr) : null,
            status: raw.releaseGate.status,
          }
        : null,
      acCoverage: jf?.acCoverage ?? [],
      stories: raw.stories.map((s) => ({
        key: s.key,
        summary: s.summary,
        jiraStatus: s.jiraStatus,
        status: s.status,
        assignee: s.assignee,
        updatedAt: s.updatedAt,
        prs: s.prs.map(sanitizePrRef),
        subtasks: s.subtasks.map((sub) => ({
          key: sub.key,
          summary: sub.summary,
          jiraStatus: sub.jiraStatus,
          status: sub.status,
          assignee: sub.assignee,
          updatedAt: sub.updatedAt,
          prs: sub.prs.map(sanitizePrRef),
        })),
      })),
      callouts,
      override: activeOverride
        ? {
            note: activeOverride.note,
            author: activeOverride.author,
            suppressStallWarning: activeOverride.suppressStallWarning,
            expires: activeOverride.expires,
          }
        : null,
      dataOk: raw.dataOk,
    };
  });

  const totalFeatures = features.length;
  const featuresWithNothingOnMaster = features.filter((f) => f.scoreBasis.shipped === 0).length;
  const headlineSentence =
    featuresWithNothingOnMaster === 0
      ? "All tracked features have shipped something to the default branch."
      : `${featuresWithNothingOnMaster} of ${totalFeatures} feature(s) have nothing shipped to the default branch yet.`;

  // Sub-task PRs included via storyPrs — a review sitting on a sub-task is
  // still a review somebody is waiting on, and omitting them is what let a
  // story with two open sub-task PRs render as "nothing to review yet".
  const reviewQueue: ReviewRequestT[] = rawFeatures.flatMap((raw) =>
    raw.stories.flatMap((s) =>
      storyPrs(s)
        .filter((p) => p.state === "OPEN")
        .flatMap((p) =>
          p.reviewRequests.map((reviewer) => ({
            pr: sanitizePrRef(p),
            featureKey: raw.key,
            reviewer,
            // GitHub's GraphQL API doesn't expose a review-request timestamp
            // directly; the PR's updatedAt is the closest available proxy.
            requestedAt: p.updatedAt,
            ageDays: daysBetween(new Date(p.updatedAt), now),
          })),
        ),
    ),
  );

  return {
    // 2: Feature.stories, each carrying its own Sub-tasks. Snapshots
    // written at version 1 still parse — see renameLegacy in schema.ts.
    schemaVersion: 2,
    date,
    generatedAt: now.toISOString(),
    epic: { ...epic, overview: epic.overview ?? "" },
    // Only milestones that actually have tracked features are published —
    // a milestone configured but not yet expanded would otherwise render as
    // an empty group in the sidebar.
    milestones: milestones
      .filter((m) => features.some((f) => f.milestone === m.id))
      .map((m) => ({ ...m, owner: people[m.owner] ?? m.owner })),
    headline: { featuresWithNothingOnMaster, totalFeatures, sentence: headlineSentence },
    kpis: {
      featuresTracked: totalFeatures,
      lightTierMilestones: new Set(features.filter((f) => f.tier === "light").map((f) => f.milestone)).size,
      storiesTracked: features.reduce((sum, f) => sum + f.scoreBasis.total, 0),
      shipped: features.reduce((sum, f) => sum + f.scoreBasis.shipped, 0),
      doneUnverified: features.reduce((sum, f) => sum + f.scoreBasis.doneUnverified, 0),
      staged: features.reduce((sum, f) => sum + f.scoreBasis.staged, 0),
      inReview: features.reduce((sum, f) => sum + f.scoreBasis.inReview, 0),
      blockedOrTodo: features.reduce((sum, f) => sum + f.scoreBasis.blocked + f.scoreBasis.todo, 0),
    },
    features,
    reviewQueue,
    collectionErrors,
  };
}

export type MergeDeps = {
  readJsonFile: (path: string) => unknown;
  loadOverrides: typeof loadOverrides;
  writeJsonAtomic: typeof writeJsonAtomic;
};

function readJsonFileFromDisk(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
  }
}

export const defaultMergeDeps: MergeDeps = {
  readJsonFile: readJsonFileFromDisk,
  loadOverrides,
  writeJsonAtomic,
};

export async function runMerge(
  date: string,
  config: Config,
  deps: MergeDeps = defaultMergeDeps,
): Promise<{ ok: true; snapshot: z.infer<typeof StatusSnapshot> } | { ok: false; reason: string }> {
  let raw: RawFile;
  let pending: PendingFile;
  try {
    raw = deps.readJsonFile(`data/raw/${date}.json`) as RawFile;
    pending = deps.readJsonFile(`data/pending/${date}.json`) as PendingFile;
  } catch (err) {
    return { ok: false, reason: `Missing collect.ts output for ${date} — run "pnpm collect" first. (${(err as Error).message})` };
  }

  let judgmentRaw: unknown;
  try {
    judgmentRaw = deps.readJsonFile(`data/judgment/${date}.json`);
  } catch (err) {
    return { ok: false, reason: `data/judgment/${date}.json is missing — run the judge skill before merge. (${(err as Error).message})` };
  }

  const validated = validateJudgment(judgmentRaw, pending);
  if (!validated.ok) {
    return validated;
  }

  const overrides = deps.loadOverrides();

  const snapshot = buildSnapshot({
    date,
    epic: raw.epic,
    milestones: raw.milestones,
    rawFeatures: raw.features,
    judgment: validated.value,
    overrides,
    now: new Date(),
    timezone: config.timezone,
    collectionErrors: raw.collectionErrors,
    people: config.people,
  });

  const finalCheck = StatusSnapshot.safeParse(snapshot);
  if (!finalCheck.success) {
    // Should be unreachable given the construction above, but never write a
    // schema-invalid snapshot regardless.
    return {
      ok: false,
      reason: `Assembled snapshot failed schema validation:\n${finalCheck.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    };
  }

  deps.writeJsonAtomic(`data/snapshots/${date}.json`, finalCheck.data);
  return { ok: true, snapshot: finalCheck.data };
}

async function main() {
  const config = loadConfig();
  const date = logicalDate(config.timezone);
  const result = await runMerge(date, config);

  if (!result.ok) {
    console.error(`\nmerge failed for ${date}:\n  ${result.reason}\n`);
    process.exit(1);
  }

  console.log(`\nWrote data/snapshots/${date}.json`);
  console.log(`  ${result.snapshot.features.length} feature(s), headline: ${result.snapshot.headline.sentence}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
