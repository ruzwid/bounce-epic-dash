#!/usr/bin/env tsx
// scripts/collect.ts
// Pulls JIRA + GitHub data for every feature configured in config.yaml,
// derives deterministic scores/stages/statuses, and writes:
//   data/raw/<date>.json     full fidelity, gitignored
//   data/pending/<date>.json judge input, trimmed, gitignored
// No judgment happens here — that's a separate Claude Code routine reading
// data/pending/<date>.json and writing data/judgment/<date>.json.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { extractAcBullets, extractOverview } from "../src/lib/adf.ts";
import {
  classifyPr,
  deriveSubtaskStatus,
  findReleaseGate,
  traceStackChain,
  type RawPr,
} from "../src/lib/classify.ts";
import { loadConfig, logicalDate } from "../src/lib/config.ts";
import type { Config, MilestoneFeature } from "../src/lib/config-schema.ts";
import { getDefaultBranch, getRepoPrs } from "../src/lib/github.ts";
import { writeJsonAtomic } from "../src/lib/io.ts";
import { cleanPrBody } from "../src/lib/prbody.ts";
import { getIssue, searchSubtasks, type RawJiraIssue } from "../src/lib/jira.ts";
import { computeScore, deriveStage, type ScoreBasis } from "../src/lib/score.ts";
import type { z } from "zod";
import type { CollectionError as CollectionErrorSchema, Stage as StageSchema, SubtaskStatus as SubtaskStatusSchema } from "../src/lib/schema.ts";

type SubtaskStatus = z.infer<typeof SubtaskStatusSchema>;
type Stage = z.infer<typeof StageSchema>;
type CollectionError = z.infer<typeof CollectionErrorSchema>;

const STATUS_PRIORITY: Record<SubtaskStatus, number> = {
  shipped: 5,
  staged: 4,
  in_review: 3,
  in_progress: 2,
  blocked: 1,
  todo: 0,
};

/** The unit of work: either a configured feature, or (light-tier,
 *  direct-subtask milestones) a synthetic feature built from the
 *  milestone's own ticket. */
export type FeatureTarget = MilestoneFeature & {
  title: string;
  milestone: "M1" | "M2" | "M3" | "M4";
  tier: "full" | "light";
};

export type RawPrRecord = {
  repo: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  baseRef: string;
  headRef: string;
  shippedToDefault: boolean;
  mergedAt: string | null;
  updatedAt: string;
  stackChain: number[];
  reviewRequests: string[];
  filesTouched: string[];
  /** Raw, uncleaned PR description — full fidelity, raw.json only. Never
   *  written to pending.json as-is (see toPending's cleanPrBody call) and
   *  never reaches a snapshot (schema.ts's PrRef has no body field). */
  body: string | null;
};

export type RawSubtask = {
  key: string;
  summary: string;
  jiraStatus: string;
  status: SubtaskStatus;
  assignee: string | null;
  updatedAt: string;
  prs: RawPrRecord[];
};

export type RawReleaseGate = {
  integrationBranch: string;
  pr: RawPrRecord | null;
  status: "open" | "merged" | "not_found";
};

export type RawFeature = {
  key: string;
  code: string;
  title: string;
  milestone: "M1" | "M2" | "M3" | "M4";
  tier: "full" | "light";
  owner: string;
  repos: string[];
  score: number;
  scoreBasis: ScoreBasis;
  stage: Stage;
  daysSinceLastActivity: number | null;
  daysInStaged: number | null;
  releaseGate: RawReleaseGate | null;
  acBullets: { id: string; text: string }[];
  /** The ticket's "Goal" prose. Comes free — the description is already
   *  fetched for AC extraction, and this reads a different section of the
   *  same payload rather than making a second call. */
  overview: string;
  subtasks: RawSubtask[];
  dataOk: boolean;
};

/** One milestone's identity and stated purpose, read from its own JIRA
 *  ticket. Progress is deliberately absent — it's derived downstream from
 *  the milestone's features. */
export type RawMilestone = {
  id: "M1" | "M2" | "M3" | "M4";
  key: string;
  title: string;
  tier: "full" | "light";
  owner: string;
  overview: string;
};

export type Deps = {
  searchSubtasks: typeof searchSubtasks;
  getIssue: typeof getIssue;
  getDefaultBranch: typeof getDefaultBranch;
  getRepoPrs: typeof getRepoPrs;
};

export const defaultDeps: Deps = { searchSubtasks, getIssue, getDefaultBranch, getRepoPrs };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toIso(jiraDate: unknown): string {
  if (typeof jiraDate !== "string" || !jiraDate) return new Date(0).toISOString();
  const parsed = new Date(jiraDate);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function daysBetween(earlier: Date, later: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function toPrRecord(pr: RawPr, org: string, defaultBranch: string, allPrsInRepo: RawPr[]): RawPrRecord {
  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: `https://github.com/${org}/${pr.repo}/pull/${pr.number}`,
    state: pr.state,
    isDraft: pr.isDraft,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    shippedToDefault: classifyPr(pr, defaultBranch).shippedToDefault,
    mergedAt: pr.mergedAt,
    updatedAt: pr.updatedAt,
    stackChain: traceStackChain(pr, allPrsInRepo, defaultBranch),
    reviewRequests: pr.reviewRequests,
    filesTouched: pr.filesTouched,
    body: pr.body,
  };
}

/** Combines per-repo status derivation (deriveSubtaskStatus needs one
 *  defaultBranch) across however many repos a feature's PRs landed in,
 *  taking the highest-priority result — if ANY repo shows the subtask
 *  shipped, the subtask is shipped, full stop. */
function combineSubtaskStatus(
  jiraStatus: string,
  statusMap: Record<string, SubtaskStatus>,
  prs: RawPr[],
  defaultBranchByRepo: Record<string, string>,
): SubtaskStatus {
  if (prs.length === 0) {
    return deriveSubtaskStatus(jiraStatus, statusMap, [], "");
  }
  const byRepo = new Map<string, RawPr[]>();
  for (const pr of prs) {
    byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
  }
  const candidates = [...byRepo.entries()].map(([repo, repoPrs]) =>
    deriveSubtaskStatus(jiraStatus, statusMap, repoPrs, defaultBranchByRepo[repo] ?? ""),
  );
  return candidates.reduce((best, candidate) =>
    STATUS_PRIORITY[candidate] > STATUS_PRIORITY[best] ? candidate : best,
  );
}

function buildRawFeature(params: {
  target: FeatureTarget;
  subtasks: RawSubtask[];
  acBullets: { id: string; text: string }[];
  overview?: string;
  releaseGate: RawReleaseGate | null;
  now: Date;
  dataOk: boolean;
  scoreWeights: Config["scoreWeights"];
}): RawFeature {
  const { target, subtasks, acBullets, overview = "", releaseGate, now, dataOk, scoreWeights } = params;
  const { score, scoreBasis } = computeScore(subtasks.map((s) => s.status), scoreWeights);
  const allShippedToDefault = subtasks.length > 0 && subtasks.every((s) => s.status === "shipped");
  const stage = deriveStage(score, allShippedToDefault);

  const activityTimestamps = [
    ...subtasks.map((s) => s.updatedAt),
    ...subtasks.flatMap((s) => s.prs.map((p) => p.updatedAt)),
  ].map((d) => new Date(d).getTime());
  const daysSinceLastActivity = activityTimestamps.length ? daysBetween(new Date(Math.max(...activityTimestamps)), now) : null;

  const stagedMergeTimestamps = subtasks
    .filter((s) => s.status === "staged")
    .flatMap((s) => s.prs.filter((p) => p.state === "MERGED" && !p.shippedToDefault))
    .map((p) => p.mergedAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  const daysInStaged = stagedMergeTimestamps.length ? daysBetween(new Date(Math.min(...stagedMergeTimestamps)), now) : null;

  return {
    key: target.key,
    code: target.code,
    title: target.title,
    milestone: target.milestone,
    tier: target.tier,
    owner: target.owner,
    repos: target.repos,
    score,
    scoreBasis,
    stage,
    daysSinceLastActivity,
    daysInStaged,
    releaseGate,
    acBullets,
    overview,
    subtasks,
    dataOk,
  };
}

/** Collects and derives everything for one feature. Never throws — any
 *  JIRA/GitHub failure is caught, recorded in the returned errors[], and
 *  the feature is returned with dataOk: false rather than crashing the
 *  whole run (per spec: one feature's failure must not affect others). */
export async function collectFeature(
  target: FeatureTarget,
  config: Config,
  now: Date,
  deps: Deps = defaultDeps,
): Promise<{ feature: RawFeature; errors: CollectionError[] }> {
  const errors: CollectionError[] = [];

  let subtaskIssues: RawJiraIssue[];
  let parentIssue: RawJiraIssue;
  try {
    [subtaskIssues, parentIssue] = await Promise.all([
      deps.searchSubtasks(target.key),
      deps.getIssue(target.key),
    ]);
  } catch (err) {
    errors.push({ source: "jira", scope: target.key, message: errMsg(err) });
    return {
      feature: buildRawFeature({
        target,
        subtasks: [],
        acBullets: [],
        releaseGate: null,
        now,
        dataOk: false,
        scoreWeights: config.scoreWeights,
      }),
      errors,
    };
  }

  const description = (parentIssue.fields as Record<string, unknown>).description;
  const acBullets = extractAcBullets(description).map((text, i) => ({ id: `ac-${i + 1}`, text }));
  const overview = extractOverview(description);

  // Prefer the live JIRA summary over config's fallback title, so
  // config.yaml doesn't have to duplicate (and go stale on) ticket titles.
  const liveTitle = (parentIssue.fields as Record<string, unknown>).summary;
  const resolvedTarget: FeatureTarget =
    typeof liveTitle === "string" && liveTitle.length > 0 ? { ...target, title: liveTitle } : target;

  let defaultBranchByRepo: Record<string, string> = {};
  let prsByRepo: Record<string, RawPr[]> = {};
  try {
    for (const repo of target.repos) {
      const [branch, prs] = await Promise.all([
        deps.getDefaultBranch(config.github.org, repo),
        deps.getRepoPrs(config.github.org, repo, config.epic.startDate),
      ]);
      defaultBranchByRepo[repo] = branch;
      prsByRepo[repo] = prs;
    }
  } catch (err) {
    errors.push({ source: "github", scope: target.key, message: errMsg(err) });
    // Best-effort: JIRA data is good, so build subtasks from JIRA status
    // alone (no PR-derived overrides) rather than dropping the feature.
    const toJiraOnlySubtask = (issue: RawJiraIssue): RawSubtask => {
      const jiraStatus = String(((issue.fields as Record<string, unknown>).status as { name?: string } | undefined)?.name ?? "");
      return {
        key: issue.key,
        summary: String((issue.fields as Record<string, unknown>).summary ?? ""),
        jiraStatus,
        status: deriveSubtaskStatus(jiraStatus, config.jira.statusMap, [], ""),
        assignee: ((issue.fields as Record<string, unknown>).assignee as { displayName?: string } | null)?.displayName ?? null,
        updatedAt: toIso((issue.fields as Record<string, unknown>).updated),
        prs: [],
      };
    };
    const subtasks: RawSubtask[] =
      subtaskIssues.length > 0 ? subtaskIssues.map(toJiraOnlySubtask) : [toJiraOnlySubtask(parentIssue)];
    return {
      feature: buildRawFeature({
        target: resolvedTarget,
        subtasks,
        acBullets,
        overview,
        releaseGate: null,
        now,
        dataOk: false,
        scoreWeights: config.scoreWeights,
      }),
      errors,
    };
  }

  const allPrs = Object.values(prsByRepo).flat();

  const toRawSubtask = (issue: RawJiraIssue): RawSubtask => {
    const key = issue.key;
    const jiraStatus = String(((issue.fields as Record<string, unknown>).status as { name?: string } | undefined)?.name ?? "");
    const matched = allPrs.filter((pr) => pr.headRefName.includes(key) || pr.title.includes(key));
    const status = combineSubtaskStatus(jiraStatus, config.jira.statusMap, matched, defaultBranchByRepo);
    const prs = matched.map((pr) => toPrRecord(pr, config.github.org, defaultBranchByRepo[pr.repo]!, prsByRepo[pr.repo]!));
    return {
      key,
      summary: String((issue.fields as Record<string, unknown>).summary ?? ""),
      jiraStatus,
      status,
      assignee: ((issue.fields as Record<string, unknown>).assignee as { displayName?: string } | null)?.displayName ?? null,
      updatedAt: toIso((issue.fields as Record<string, unknown>).updated),
      prs,
    };
  };

  // A feature ticket with no subtasks yet can still be actively worked
  // (e.g. "Code Review" on the ticket itself) — falling back to zero
  // subtasks would silently read as not_started. Treat the parent ticket
  // as a single subtask-equivalent data point in that case, matching PRs
  // against the feature's own key the same way a real subtask would be.
  const subtasks: RawSubtask[] = subtaskIssues.length > 0 ? subtaskIssues.map(toRawSubtask) : [toRawSubtask(parentIssue)];

  // Release gate: the integration branch most of THIS feature's own staged
  // PRs (i.e. PRs already attributed to one of its subtasks, not every PR
  // in a repo it happens to share with other features) actually merged
  // into. There's normally exactly one; if several, take the majority so
  // the reported gate reflects most of the work.
  let releaseGate: RawReleaseGate | null = null;
  const featurePrs = subtasks.flatMap((s) => s.prs);
  const stagedPrs = featurePrs.filter((pr) => pr.state === "MERGED" && !pr.shippedToDefault);
  if (stagedPrs.length > 0) {
    const counts = new Map<string, number>();
    for (const pr of stagedPrs) {
      const k = `${pr.repo}::${pr.baseRef}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [repo, branch] = top[0].split("::") as [string, string];
      const gate = findReleaseGate(branch, prsByRepo[repo] ?? [], defaultBranchByRepo[repo]!);
      releaseGate = {
        integrationBranch: gate.integrationBranch,
        pr: gate.pr ? toPrRecord(gate.pr, config.github.org, defaultBranchByRepo[repo]!, prsByRepo[repo] ?? []) : null,
        status: gate.status,
      };
    }
  }

  return {
    feature: buildRawFeature({
      target: resolvedTarget,
      subtasks,
      acBullets,
      overview,
      releaseGate,
      now,
      dataOk: true,
      scoreWeights: config.scoreWeights,
    }),
    errors,
  };
}

/** Expands config.milestones into the flat list of features to collect.
 *  Light-tier milestones with no features[] fall back to direct-subtask
 *  mode using milestone.ticket. A milestone with neither is a clear,
 *  recorded error — never a crash, never invented data. */
function expandTargets(config: Config): { targets: FeatureTarget[]; errors: CollectionError[] } {
  const targets: FeatureTarget[] = [];
  const errors: CollectionError[] = [];

  for (const milestone of config.milestones) {
    if (milestone.features.length > 0) {
      for (const feature of milestone.features) {
        targets.push({
          ...feature,
          title: feature.code,
          milestone: milestone.id,
          tier: milestone.tier,
        });
      }
    } else if (milestone.ticket) {
      targets.push({
        key: milestone.ticket,
        code: milestone.id,
        owner: milestone.owner,
        repos: milestone.repos,
        title: milestone.title,
        milestone: milestone.id,
        tier: milestone.tier,
      });
    } else {
      errors.push({
        source: "jira",
        scope: milestone.id,
        message: `Milestone ${milestone.id} has neither features[] nor a ticket configured — skipping. Set one in config.yaml.`,
      });
    }
  }

  return { targets, errors };
}

export type PendingFeature = {
  key: string;
  code: string;
  title: string;
  owner: string;
  milestone: "M1" | "M2" | "M3" | "M4";
  score: number;
  scoreBasis: ScoreBasis;
  daysSinceLastActivity: number | null;
  daysInStaged: number | null;
  releaseGateStatus: "open" | "merged" | "not_found" | null;
  acBullets: { id: string; text: string }[];
  /** The ticket's stated goal, so the judge writes its rationale against
   *  what the feature is supposed to do rather than inferring intent from
   *  subtask titles alone. */
  overview: string;
  subtasks: { key: string; summary: string; status: SubtaskStatus }[];
  prs: {
    ref: string;
    title: string;
    state: string;
    filesTouched: string[];
    /** Cleaned PR description — the primary AC-coverage evidence for the
     *  judge. Always present (not conditional), null when cleaning left
     *  nothing substantive (see bodySignal). */
    body: string | null;
    bodyTruncated: boolean;
    bodySignal: "template_only" | null;
  }[];
  dataOk: boolean;
};

export type PendingFile = {
  schemaVersion: 1;
  date: string;
  epicTitle: string;
  features: PendingFeature[];
};

export type RawFile = {
  schemaVersion: 1;
  date: string;
  generatedAt: string;
  epic: Config["epic"] & { overview: string };
  milestones: RawMilestone[];
  features: RawFeature[];
  collectionErrors: CollectionError[];
};

/**
 * The epic's and each milestone's own description.
 *
 * One extra JIRA read per milestone plus one for the epic — a handful of
 * calls against the dozens this run already makes for features and PRs.
 * Nothing here is cached between runs: the text is fetched, not generated,
 * so re-reading it costs a request and guarantees the dashboard never
 * shows a description that was edited in JIRA yesterday.
 *
 * A milestone whose ticket can't be read is recorded and skipped, never
 * fatal — the features underneath it are the actual payload.
 */
async function collectContext(
  config: Config,
  deps: Deps,
): Promise<{ epicOverview: string; milestones: RawMilestone[]; errors: CollectionError[] }> {
  const errors: CollectionError[] = [];

  const epicOverview = await deps
    .getIssue(config.epic.key, ["summary", "description"])
    .then((issue) => extractOverview((issue.fields as Record<string, unknown>).description))
    .catch((err) => {
      errors.push({ source: "jira", scope: config.epic.key, message: errMsg(err) });
      return "";
    });

  const milestones = await Promise.all(
    config.milestones.map(async (milestone): Promise<RawMilestone> => {
      const base = {
        id: milestone.id,
        key: milestone.ticket ?? "",
        title: milestone.title,
        tier: milestone.tier,
        owner: milestone.owner,
      };
      if (!milestone.ticket) return { ...base, overview: "" };
      try {
        const issue = await deps.getIssue(milestone.ticket, ["summary", "description"]);
        const fields = issue.fields as Record<string, unknown>;
        // Prefer the live JIRA summary, same as features do, so config.yaml
        // doesn't have to duplicate (and go stale on) milestone titles.
        const liveTitle = typeof fields.summary === "string" && fields.summary ? fields.summary : milestone.title;
        return { ...base, title: liveTitle, overview: extractOverview(fields.description) };
      } catch (err) {
        errors.push({ source: "jira", scope: milestone.ticket, message: errMsg(err) });
        return { ...base, overview: "" };
      }
    }),
  );

  return { epicOverview, milestones, errors };
}

export function toPending(feature: RawFeature): PendingFeature {
  const prs = feature.subtasks.flatMap((s) => s.prs);
  return {
    key: feature.key,
    code: feature.code,
    title: feature.title,
    owner: feature.owner,
    milestone: feature.milestone,
    score: feature.score,
    scoreBasis: feature.scoreBasis,
    daysSinceLastActivity: feature.daysSinceLastActivity,
    daysInStaged: feature.daysInStaged,
    releaseGateStatus: feature.releaseGate?.status ?? null,
    acBullets: feature.acBullets,
    overview: feature.overview,
    subtasks: feature.subtasks.map((s) => ({ key: s.key, summary: s.summary, status: s.status })),
    prs: prs.map((p) => {
      const cleaned = cleanPrBody(p.body);
      return {
        ref: `${p.repo}#${p.number}`,
        title: p.title,
        state: p.state,
        filesTouched: p.filesTouched,
        body: cleaned.body,
        bodyTruncated: cleaned.bodyTruncated,
        bodySignal: cleaned.bodySignal,
      };
    }),
    dataOk: feature.dataOk,
  };
}

export async function runCollect(config: Config, now: Date, deps: Deps = defaultDeps) {
  const date = logicalDate(config.timezone, now);
  const { targets, errors: expandErrors } = expandTargets(config);

  const [results, context] = await Promise.all([
    Promise.all(targets.map((target) => collectFeature(target, config, now, deps))),
    collectContext(config, deps),
  ]);
  const features = results.map((r) => r.feature);
  const collectionErrors = [...expandErrors, ...results.flatMap((r) => r.errors), ...context.errors];

  const raw = {
    schemaVersion: 1 as const,
    date,
    generatedAt: now.toISOString(),
    epic: { ...config.epic, overview: context.epicOverview },
    milestones: context.milestones,
    features,
    collectionErrors,
  };
  const pending = {
    schemaVersion: 1 as const,
    date,
    epicTitle: config.epic.title,
    features: features.map(toPending),
  };

  writeJsonAtomic(`data/raw/${date}.json`, raw);
  writeJsonAtomic(`data/pending/${date}.json`, pending);

  return { date, features, collectionErrors };
}

async function main() {
  const config = loadConfig();
  const { date, features, collectionErrors } = await runCollect(config, new Date());

  console.log(`\nCollected ${features.length} feature(s) for ${date}:\n`);
  for (const f of features) {
    const shipped = f.scoreBasis.shipped;
    const staged = f.scoreBasis.staged;
    const total = f.scoreBasis.total;
    const gate = f.releaseGate ? f.releaseGate.status : "n/a";
    const flag = f.dataOk ? "" : "  [dataOk=false]";
    console.log(
      `  ${f.code.padEnd(8)} ${f.key.padEnd(12)} score=${String(f.score).padStart(3)} stage=${f.stage.padEnd(11)} shipped/staged/total=${shipped}/${staged}/${total} gate=${gate}${flag}`,
    );
  }

  if (collectionErrors.length > 0) {
    console.warn(`\n${collectionErrors.length} collection error(s):`);
    for (const e of collectionErrors) {
      console.warn(`  [${e.source}] ${e.scope}: ${e.message}`);
    }
  }

  console.log(`\nWrote data/raw/${date}.json and data/pending/${date}.json`);

  const allFailed = features.length > 0 && features.every((f) => !f.dataOk);
  if (allFailed) {
    console.error("\nEvery feature failed to collect — exiting non-zero.");
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
