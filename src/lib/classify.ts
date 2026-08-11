// src/lib/classify.ts
// Pure, deterministic PR classification. No network, no judgment — this is
// the code that enforces the central rule of this codebase:
//
//   shipped = state MERGED && baseRefName === repo default branch
//   staged  = state MERGED && baseRefName !== default branch
//
// Never collapse staged into shipped, anywhere, in any count or label.
import type { z } from "zod";
import type { SubtaskStatus as SubtaskStatusSchema } from "./schema.ts";

type SubtaskStatus = z.infer<typeof SubtaskStatusSchema>;

/** A GitHub PR as fetched by src/lib/github.ts, before shippedToDefault /
 *  stackChain have been computed (that's what this module does). */
export type RawPr = {
  repo: string;
  number: number;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  mergedAt: string | null;
  updatedAt: string;
  reviewRequests: string[];
  /** never published: kept in raw.json only */
  filesTouched: string[];
};

export type ReleaseGateResult = {
  integrationBranch: string;
  pr: RawPr | null;
  status: "open" | "merged" | "not_found";
};

/** The single source of truth for the shipped/staged distinction. */
export function classifyPr(pr: RawPr, defaultBranch: string): { shippedToDefault: boolean } {
  return { shippedToDefault: pr.state === "MERGED" && pr.baseRefName === defaultBranch };
}

/** Walks the stack down from `pr` to the master-based PR at the bottom,
 *  following `baseRefName === otherPr.headRefName` links. Returns the PR
 *  numbers along that path (excluding `pr` itself), ending with the PR
 *  whose base is the default branch. Returns [] if `pr` is already
 *  based on the default branch, or if a link in the chain can't be found
 *  in `allPrsInRepo` (never throws — an incomplete trace is recorded as an
 *  empty/partial chain, not a crash). */
export function traceStackChain(pr: RawPr, allPrsInRepo: RawPr[], defaultBranch: string): number[] {
  const chain: number[] = [];
  const visited = new Set<number>([pr.number]);
  let current = pr;

  while (current.baseRefName !== defaultBranch) {
    const next = allPrsInRepo.find(
      (candidate) => candidate.headRefName === current.baseRefName && !visited.has(candidate.number),
    );
    if (!next) break;
    chain.push(next.number);
    visited.add(next.number);
    current = next;
  }

  return chain;
}

/** For a staged integration branch, finds its release PR into the default
 *  branch (a PR whose headRefName is that branch and baseRefName is the
 *  default branch). NEVER assumes shipped when no such PR exists —
 *  status is "not_found", not "merged". */
export function findReleaseGate(
  integrationBranch: string,
  allPrsInRepo: RawPr[],
  defaultBranch: string,
): ReleaseGateResult {
  const releasePr = allPrsInRepo.find(
    (pr) => pr.headRefName === integrationBranch && pr.baseRefName === defaultBranch,
  );

  if (!releasePr) {
    return { integrationBranch, pr: null, status: "not_found" };
  }
  return {
    integrationBranch,
    pr: releasePr,
    status: releasePr.state === "MERGED" ? "merged" : "open",
  };
}

/** Derives a subtask's GitHub-aware status. Starts from the JIRA status
 *  mapped through config's statusMap (default "todo" + a warning for
 *  unmapped names — the map should have an entry for every status the
 *  configured JIRA project actually uses), then upgrades to "shipped" or
 *  "staged" if any linked PR proves it, since a stale JIRA status must
 *  never outrank real GitHub activity. */
export function deriveSubtaskStatus(
  jiraStatus: string,
  statusMap: Record<string, SubtaskStatus>,
  prs: RawPr[],
  defaultBranch: string,
): SubtaskStatus {
  let base = statusMap[jiraStatus];
  if (base === undefined) {
    console.warn(`deriveSubtaskStatus: unmapped JIRA status "${jiraStatus}", defaulting to "todo"`);
    base = "todo";
  }

  if (prs.some((pr) => classifyPr(pr, defaultBranch).shippedToDefault)) {
    return "shipped";
  }
  if (prs.some((pr) => pr.state === "MERGED")) {
    return "staged";
  }
  if (prs.some((pr) => pr.state === "OPEN")) {
    return "in_review";
  }
  return base;
}
