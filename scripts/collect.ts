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
  deriveWorkStatus,
  findReleaseGate,
  isAutomatedReleasePr,
  traceStackChain,
  type RawPr,
} from "../src/lib/classify.ts";
import { loadConfig, logicalDate } from "../src/lib/config.ts";
import type { Config, MilestoneFeature } from "../src/lib/config-schema.ts";
import { getDefaultBranch, getRepoPrs, listOrgRepos } from "../src/lib/github.ts";
import { writeJsonAtomic } from "../src/lib/io.ts";
import { cleanPrBody } from "../src/lib/prbody.ts";
import { DEFAULT_ISSUE_FIELDS, getIssue, searchChildren, type RawJiraIssue } from "../src/lib/jira.ts";
import { computeScore, deriveStage, type ScoreBasis } from "../src/lib/score.ts";
import { featurePrs, storyPrs } from "../src/lib/stories.ts";
import type { z } from "zod";
import type { CollectionError as CollectionErrorSchema, Stage as StageSchema, WorkStatus as WorkStatusSchema } from "../src/lib/schema.ts";

type WorkStatus = z.infer<typeof WorkStatusSchema>;
type Stage = z.infer<typeof StageSchema>;
type CollectionError = z.infer<typeof CollectionErrorSchema>;

const STATUS_PRIORITY: Record<WorkStatus, number> = {
  shipped: 6,
  done_unverified: 5,
  staged: 4,
  in_review: 3,
  in_progress: 2,
  blocked: 1,
  todo: 0,
};

/** The unit of work: either a configured feature, or (light-tier,
 *  direct-story milestones) a synthetic feature built from the
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
  reviews: { reviewer: string; state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" }[];
  author: string | null;
  filesTouched: string[];
  /** Raw, uncleaned PR description — full fidelity, raw.json only. Never
   *  written to pending.json as-is (see toPending's cleanPrBody call) and
   *  never reaches a snapshot (schema.ts's PrRef has no body field). */
  body: string | null;
};

/** Fields shared by both tracked levels below a Feature. */
type RawWorkItem = {
  key: string;
  summary: string;
  jiraStatus: string;
  status: WorkStatus;
  assignee: string | null;
  updatedAt: string;
  /** PRs matched to this ticket's own key only — a Story does not absorb
   *  its sub-tasks' PRs here. See storyPrs() in src/lib/stories.ts. */
  prs: RawPrRecord[];
};

/** A JIRA Sub-task — the leaf. Not a scoring unit; see schema.ts. */
export type RawSubtask = RawWorkItem;

export type RawStory = RawWorkItem & {
  subtasks: RawSubtask[];
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
  stories: RawStory[];
  /** JIRA's "Product Sign Off" field (customfield_10698) is "Approved" —
   *  a human, out-of-band approval that overrides deriveStage's normal
   *  score/shipped-based bands (see src/lib/score.ts). Never published to
   *  the Feature schema; stage === "done" combined with a story that's
   *  still done_unverified is, by construction, only reachable this way. */
  signedOff: boolean;
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
  searchChildren: typeof searchChildren;
  getIssue: typeof getIssue;
  getDefaultBranch: typeof getDefaultBranch;
  getRepoPrs: typeof getRepoPrs;
  listOrgRepos: typeof listOrgRepos;
};

export const defaultDeps: Deps = { searchChildren, getIssue, getDefaultBranch, getRepoPrs, listOrgRepos };

/**
 * Every pull request in the org since the epic's start date, fetched once
 * per run and shared by every feature.
 *
 * This is deliberately not scoped per feature. Attribution has always been
 * by ticket key — a PR belongs to BOUN-11312 because its branch or title
 * says so, not because of which repo it's in — so scoping the *fetch* by
 * repo could only ever hide matches. It did: a hand-maintained
 * `repos: [dashboard]` per feature meant PRs in dashboard-api, ts-types,
 * admin-v2 and cron-api were never even looked at, and roughly two thirds
 * of this epic's pull requests were invisible.
 */
export type PrIndex = {
  allPrs: RawPr[];
  prsByRepo: Record<string, RawPr[]>;
  defaultBranchByRepo: Record<string, string>;
  /** True when GitHub gave us nothing at all this run. Features collected
   *  against a degraded index are marked dataOk: false — otherwise a total
   *  GitHub outage would render every feature as a confident 0%, which is
   *  exactly the false certainty this dashboard exists to avoid. A single
   *  unreachable repo out of twenty-five is not degraded; it's recorded as
   *  a collection error and the rest of the run stands. */
  degraded: boolean;
};

export async function buildPrIndex(
  config: Config,
  deps: Deps,
): Promise<{ index: PrIndex; errors: CollectionError[] }> {
  const errors: CollectionError[] = [];
  const org = config.github.org;

  let discovered: { name: string; defaultBranch: string }[] = [];
  try {
    discovered = await deps.listOrgRepos(org, config.epic.startDate);
  } catch (err) {
    errors.push({ source: "github", scope: org, message: `Repo discovery failed: ${errMsg(err)}` });
  }

  const excluded = new Set(config.github.excludeRepos);
  const names = new Set(discovered.filter((r) => !excluded.has(r.name)).map((r) => r.name));
  for (const name of config.github.includeRepos) names.add(name);

  const defaultBranchByRepo: Record<string, string> = {};
  for (const repo of discovered) defaultBranchByRepo[repo.name] = repo.defaultBranch;

  const prsByRepo: Record<string, RawPr[]> = {};
  await Promise.all(
    [...names].map(async (repo) => {
      try {
        // An explicitly included repo may not have come from discovery, so
        // its default branch isn't known yet.
        defaultBranchByRepo[repo] ??= await deps.getDefaultBranch(org, repo);
        // Empty automated-release PRs (see isAutomatedReleasePr) are dropped
        // here, before anything can match them to a ticket — the earliest
        // point in the pipeline that touches every repo's PRs.
        prsByRepo[repo] = (await deps.getRepoPrs(org, repo, config.epic.startDate)).filter(
          (pr) => !isAutomatedReleasePr(pr.title),
        );
      } catch (err) {
        // One unreachable repo must not cost us the other twenty-four.
        errors.push({ source: "github", scope: `${org}/${repo}`, message: errMsg(err) });
      }
    }),
  );

  const fetched = Object.keys(prsByRepo).length;
  return {
    index: {
      allPrs: Object.values(prsByRepo).flat(),
      prsByRepo,
      defaultBranchByRepo,
      degraded: names.size === 0 || fetched === 0,
    },
    errors,
  };
}

/** Whether `text` references `key` as a whole token.
 *
 *  A plain `includes` would let BOUN-11312 match a PR for BOUN-113120.
 *  That was near-harmless while only three repos were searched; across
 *  every repo in the org it is a real way to attribute someone else's
 *  work to a feature. */
export function mentionsTicket(text: string, key: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${key}([^0-9]|$)`).test(text);
}

/** Collection errors are rendered verbatim in the dashboard's banner, so
 *  they have to survive an upstream that answers with an HTML error page
 *  rather than JSON — a raw nginx 502 body would otherwise fill the
 *  callout with markup. Tags are stripped, whitespace collapsed, and the
 *  result capped at a readable length. */
function errMsg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
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
    reviews: pr.reviews,
    author: pr.author,
    filesTouched: pr.filesTouched,
    body: pr.body,
  };
}

/** Combines per-repo status derivation (deriveWorkStatus needs one
 *  defaultBranch) across however many repos a feature's PRs landed in,
 *  taking the highest-priority result — if ANY repo shows the story
 *  shipped, the story is shipped, full stop. */
function combineWorkStatus(
  jiraStatus: string,
  statusMap: Record<string, WorkStatus>,
  prs: RawPr[],
  defaultBranchByRepo: Record<string, string>,
): WorkStatus {
  if (prs.length === 0) {
    return deriveWorkStatus(jiraStatus, statusMap, [], "");
  }
  const byRepo = new Map<string, RawPr[]>();
  for (const pr of prs) {
    byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
  }
  const candidates = [...byRepo.entries()].map(([repo, repoPrs]) =>
    deriveWorkStatus(jiraStatus, statusMap, repoPrs, defaultBranchByRepo[repo] ?? ""),
  );
  return candidates.reduce((best, candidate) =>
    STATUS_PRIORITY[candidate] > STATUS_PRIORITY[best] ? candidate : best,
  );
}

/**
 * Folds a Story's Sub-task evidence into the status derived from its own
 * PRs. Only ever raises, and only as far as the evidence actually proves:
 *
 *   every sub-task shipped        -> at least "shipped"  (fully proven)
 *   any sub-task has a live PR    -> at least "in_review" (work in flight)
 *
 * Deliberately NOT a flat union of every PR: deriveWorkStatus returns
 * "shipped" the moment any single PR shipped, so unioning a story's
 * sub-task PRs would let one merged sub-task out of five declare the whole
 * story shipped — the precise over-claim this dashboard exists to catch.
 *
 * Never lowers a status either. A story whose sub-tasks are all "todo" is
 * left exactly as its own JIRA status and PRs describe it; inferring
 * regressions from an incomplete decomposition would be its own kind of
 * invention.
 */
export function rollUpStoryStatus(ownStatus: WorkStatus, subtasks: { status: WorkStatus }[]): WorkStatus {
  if (subtasks.length === 0) return ownStatus;

  const atLeast = (candidate: WorkStatus) =>
    STATUS_PRIORITY[candidate] > STATUS_PRIORITY[ownStatus] ? candidate : ownStatus;

  if (subtasks.every((s) => s.status === "shipped")) return atLeast("shipped");
  if (
    subtasks.some(
      (s) => s.status === "shipped" || s.status === "done_unverified" || s.status === "staged" || s.status === "in_review",
    )
  ) {
    return atLeast("in_review");
  }
  return ownStatus;
}

function buildRawFeature(params: {
  target: FeatureTarget;
  stories: RawStory[];
  acBullets: { id: string; text: string }[];
  overview?: string;
  releaseGate: RawReleaseGate | null;
  /** Derived from the feature's attributed PRs; empty when none matched. */
  repos?: string[];
  now: Date;
  dataOk: boolean;
  signedOff: boolean;
  scoreWeights: Config["scoreWeights"];
}): RawFeature {
  const { target, stories, acBullets, overview = "", releaseGate, repos = [], now, dataOk, signedOff, scoreWeights } = params;
  const { score, scoreBasis } = computeScore(stories.map((s) => s.status), scoreWeights);
  const allShippedToDefault = stories.length > 0 && stories.every((s) => s.status === "shipped");
  const stage = deriveStage(score, allShippedToDefault, signedOff);

  // Sub-tasks count as activity too — a story untouched for a month whose
  // sub-task shipped yesterday is not stalled.
  const activityTimestamps = [
    ...stories.map((s) => s.updatedAt),
    ...stories.flatMap((s) => s.subtasks.map((sub) => sub.updatedAt)),
    ...stories.flatMap((s) => storyPrs(s).map((p) => p.updatedAt)),
  ].map((d) => new Date(d).getTime());
  const daysSinceLastActivity = activityTimestamps.length ? daysBetween(new Date(Math.max(...activityTimestamps)), now) : null;

  const stagedMergeTimestamps = stories
    .filter((s) => s.status === "staged" || s.status === "done_unverified")
    .flatMap((s) => storyPrs(s).filter((p) => p.state === "MERGED" && !p.shippedToDefault))
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
    repos,
    score,
    scoreBasis,
    stage,
    daysSinceLastActivity,
    daysInStaged,
    releaseGate,
    acBullets,
    overview,
    stories,
    signedOff,
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
  prIndex: PrIndex = { allPrs: [], prsByRepo: {}, defaultBranchByRepo: {}, degraded: false },
): Promise<{ feature: RawFeature; errors: CollectionError[] }> {
  const errors: CollectionError[] = [];

  let storyIssues: RawJiraIssue[];
  let parentIssue: RawJiraIssue;
  try {
    [storyIssues, parentIssue] = await Promise.all([
      deps.searchChildren(target.key),
      deps.getIssue(target.key, [...DEFAULT_ISSUE_FIELDS, "customfield_10698"]),
    ]);
  } catch (err) {
    errors.push({ source: "jira", scope: target.key, message: errMsg(err) });
    return {
      feature: buildRawFeature({
        target,
        stories: [],
        acBullets: [],
        releaseGate: null,
        now,
        dataOk: false,
        signedOff: false,
        scoreWeights: config.scoreWeights,
      }),
      errors,
    };
  }

  const description = (parentIssue.fields as Record<string, unknown>).description;
  const acBullets = extractAcBullets(description).map((text, i) => ({ id: `ac-${i + 1}`, text }));
  const overview = extractOverview(description);
  const productSignOff = (parentIssue.fields as Record<string, unknown>).customfield_10698 as
    | { value?: string }
    | null
    | undefined;
  const signedOff = productSignOff?.value === "Approved";

  // Prefer the live JIRA summary over config's fallback title, so
  // config.yaml doesn't have to duplicate (and go stale on) ticket titles.
  const liveTitle = (parentIssue.fields as Record<string, unknown>).summary;
  const resolvedTarget: FeatureTarget =
    typeof liveTitle === "string" && liveTitle.length > 0 ? { ...target, title: liveTitle } : target;

  const { allPrs, prsByRepo, defaultBranchByRepo } = prIndex;

  const fieldsOf = (issue: RawJiraIssue) => issue.fields as Record<string, unknown>;

  // The automated-release housekeeping ticket itself (JIRA summary "...
  // Empty Pull Request For Automated Release", e.g. BOUN-11497) is not
  // real work — dropped here so it never becomes a Story/Sub-task, on top
  // of buildPrIndex already dropping the empty PRs it's the namesake of.
  const isRealWorkItem = (issue: RawJiraIssue) => !isAutomatedReleasePr(String(fieldsOf(issue).summary ?? ""));

  // Searched across every repo in the org — a ticket's work is wherever its
  // key says it is. When the index is empty (GitHub unreachable this run,
  // recorded by buildPrIndex), this degrades to the JIRA status alone
  // rather than dropping the feature.
  const matchPrs = (key: string) =>
    allPrs.filter((pr) => mentionsTicket(pr.headRefName, key) || mentionsTicket(pr.title, key));

  const toWorkItem = (issue: RawJiraIssue) => {
    const key = issue.key;
    const jiraStatus = String((fieldsOf(issue).status as { name?: string } | undefined)?.name ?? "");
    const matched = matchPrs(key);
    return {
      key,
      summary: String(fieldsOf(issue).summary ?? ""),
      jiraStatus,
      status: combineWorkStatus(jiraStatus, config.jira.statusMap, matched, defaultBranchByRepo),
      assignee: (fieldsOf(issue).assignee as { displayName?: string } | null)?.displayName ?? null,
      updatedAt: toIso(fieldsOf(issue).updated),
      prs: matched.map((pr) => toPrRecord(pr, config.github.org, defaultBranchByRepo[pr.repo]!, prsByRepo[pr.repo]!)),
    };
  };

  /** A Story plus the level below it. Sub-tasks are where a good deal of
   *  this epic's branch names actually live — collecting only Stories left
   *  their pull requests attributed to nothing and therefore invisible. */
  const toRawStory = async (issue: RawJiraIssue): Promise<RawStory> => {
    const own = toWorkItem(issue);
    let subtaskIssues: RawJiraIssue[] = [];
    try {
      subtaskIssues = await deps.searchChildren(issue.key);
    } catch (err) {
      // One story's children failing must not cost the whole feature —
      // same containment rule the feature-level fetch already follows.
      errors.push({ source: "jira", scope: issue.key, message: `Sub-task fetch failed: ${errMsg(err)}` });
    }
    const subtasks: RawSubtask[] = subtaskIssues.filter(isRealWorkItem).map(toWorkItem);
    return { ...own, status: rollUpStoryStatus(own.status, subtasks), subtasks };
  };

  // A feature ticket with no stories yet can still be actively worked
  // (e.g. "Code Review" on the ticket itself) — falling back to zero
  // stories would silently read as not_started. Treat the parent ticket
  // as a single story-equivalent data point in that case, matching PRs
  // against the feature's own key the same way a real story would be.
  const realStoryIssues = storyIssues.filter(isRealWorkItem);
  const stories: RawStory[] = await Promise.all(
    (realStoryIssues.length > 0 ? realStoryIssues : [parentIssue]).map(toRawStory),
  );

  // Release gate: the integration branch most of THIS feature's own staged
  // PRs (i.e. PRs already attributed to one of its stories, not every PR
  // in a repo it happens to share with other features) actually merged
  // into. There's normally exactly one; if several, take the majority so
  // the reported gate reflects most of the work.
  let releaseGate: RawReleaseGate | null = null;
  // Every PR under the feature, sub-tasks included — a release gate or a
  // repo list built from Story-level PRs alone would miss whole branches.
  const allFeaturePrs = featurePrs({ stories });
  const stagedPrs = allFeaturePrs.filter((pr) => pr.state === "MERGED" && !pr.shippedToDefault);
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
      stories,
      acBullets,
      overview,
      releaseGate,
      // The repos this feature's work actually landed in, derived from the
      // PRs attributed to it — not declared up front. A feature with no
      // PRs yet reports none, which is the honest answer.
      repos: [...new Set(allFeaturePrs.map((pr) => pr.repo))].sort(),
      now,
      dataOk: !prIndex.degraded,
      signedOff,
      scoreWeights: config.scoreWeights,
    }),
    errors,
  };
}

/** Expands config.milestones into the flat list of features to collect.
 *  Light-tier milestones with no features[] fall back to direct-story
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
   *  story titles alone. */
  overview: string;
  /** Sub-tasks are listed under their story so the judge can cite one as
   *  evidence — refWhitelistFor (scripts/merge.ts) accepts these keys. */
  stories: {
    key: string;
    summary: string;
    status: WorkStatus;
    subtasks: { key: string; summary: string; status: WorkStatus }[];
  }[];
  /** JIRA's "Product Sign Off" field is Approved — see RawFeature.signedOff.
   *  The judge needs this to explain a feature whose stage reads "Done" for
   *  reasons other than the normal shipped-story path (see judge SKILL.md). */
  signedOff: boolean;
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
  const prs = featurePrs(feature);
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
    signedOff: feature.signedOff,
    stories: feature.stories.map((s) => ({
      key: s.key,
      summary: s.summary,
      status: s.status,
      subtasks: s.subtasks.map((sub) => ({ key: sub.key, summary: sub.summary, status: sub.status })),
    })),
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

  // The PR index is built once, before any feature is collected, and
  // shared by all of them — every repo in the org is fetched exactly once
  // per run no matter how many features reference it.
  const [prIndex, context] = await Promise.all([buildPrIndex(config, deps), collectContext(config, deps)]);

  const results = await Promise.all(
    targets.map((target) => collectFeature(target, config, now, deps, prIndex.index)),
  );
  const features = results.map((r) => r.feature);
  const collectionErrors = [
    ...expandErrors,
    ...prIndex.errors,
    ...results.flatMap((r) => r.errors),
    ...context.errors,
  ];

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
    const doneUnverified = f.scoreBasis.doneUnverified;
    const staged = f.scoreBasis.staged;
    const total = f.scoreBasis.total;
    const gate = f.releaseGate ? f.releaseGate.status : "n/a";
    const flag = f.dataOk ? "" : "  [dataOk=false]";
    console.log(
      `  ${f.code.padEnd(8)} ${f.key.padEnd(12)} score=${String(f.score).padStart(3)} stage=${f.stage.padEnd(11)} shipped/doneUnverified/staged/total=${shipped}/${doneUnverified}/${staged}/${total} gate=${gate}${flag}`,
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
