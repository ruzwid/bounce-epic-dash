// src/lib/github.ts
// GitHub GraphQL client (Octokit), batched. The REST search API's 30/min
// limit will bite, so this uses one GraphQL query per repo/page instead.
import { graphql } from "@octokit/graphql";
import type { RawPr } from "./classify.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} (set it in .env.local)`);
  }
  return value;
}

type GraphqlClient = typeof graphql;
let client: GraphqlClient | undefined;
function getClient(): GraphqlClient {
  if (!client) {
    client = graphql.defaults({
      headers: { authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}` },
    });
  }
  return client;
}

/** Cached per process run: default branch rarely changes mid-run, and this
 *  avoids one extra round trip per PR classified. */
const defaultBranchCache = new Map<string, string>();

export async function getDefaultBranch(org: string, repo: string): Promise<string> {
  const cacheKey = `${org}/${repo}`;
  const cached = defaultBranchCache.get(cacheKey);
  if (cached) return cached;

  const result = await getClient()<{
    repository: { defaultBranchRef: { name: string } | null };
  }>(
    `query GetDefaultBranch($org: String!, $repo: String!) {
      repository(owner: $org, name: $repo) {
        defaultBranchRef { name }
      }
    }`,
    { org, repo },
  );

  const branch = result.repository.defaultBranchRef?.name;
  if (!branch) {
    throw new Error(`Repo ${cacheKey} has no default branch (empty repo?)`);
  }
  defaultBranchCache.set(cacheKey, branch);
  return branch;
}

type PrNode = {
  number: number;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  mergedAt: string | null;
  updatedAt: string;
  createdAt: string;
  /** Always fetched — PR descriptions are the primary AC-coverage
   *  evidence at this org (see src/lib/prbody.ts). null when a PR has no
   *  description at all. */
  body: string | null;
  reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string } | null }> };
  files: { nodes: Array<{ path: string }> };
};

const PR_PAGE_QUERY = `
  query GetRepoPrs($org: String!, $repo: String!, $after: String) {
    repository(owner: $org, name: $repo) {
      pullRequests(first: 50, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          state
          isDraft
          baseRefName
          headRefName
          mergedAt
          updatedAt
          createdAt
          body
          reviewRequests(first: 20) {
            nodes {
              requestedReviewer {
                ... on User { login }
              }
            }
          }
          files(first: 100) {
            nodes { path }
          }
        }
      }
    }
  }
`;

function toRawPr(repo: string, node: PrNode): RawPr {
  return {
    repo,
    number: node.number,
    title: node.title,
    state: node.state,
    isDraft: node.isDraft,
    baseRefName: node.baseRefName,
    headRefName: node.headRefName,
    mergedAt: node.mergedAt,
    updatedAt: node.updatedAt,
    body: node.body,
    reviewRequests: node.reviewRequests.nodes
      .map((r) => r.requestedReviewer?.login)
      .filter((login): login is string => Boolean(login)),
    filesTouched: node.files.nodes.map((f) => f.path),
  };
}

/** All PRs in `org/repo` created on or after `sinceISO`. Pages are fetched
 *  newest-first and pagination stops as soon as a page's PRs are entirely
 *  older than `sinceISO` — no need to walk a repo's full PR history. */
export async function getRepoPrs(org: string, repo: string, sinceISO: string): Promise<RawPr[]> {
  const since = new Date(sinceISO).getTime();
  const prs: RawPr[] = [];
  let after: string | undefined;

  for (;;) {
    const result: {
      repository: { pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: PrNode[] } };
    } = await getClient()(PR_PAGE_QUERY, { org, repo, after });

    const { nodes, pageInfo } = result.repository.pullRequests;
    let hitOlderThanSince = false;
    for (const node of nodes) {
      if (new Date(node.createdAt).getTime() < since) {
        hitOlderThanSince = true;
        break;
      }
      prs.push(toRawPr(repo, node));
    }

    if (hitOlderThanSince || !pageInfo.hasNextPage) break;
    after = pageInfo.endCursor ?? undefined;
    if (!after) break;
  }

  return prs;
}
