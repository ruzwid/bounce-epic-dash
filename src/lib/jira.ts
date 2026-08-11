// src/lib/jira.ts
// JIRA REST client. Basic auth from env vars only — never logs a token.
// Uses POST /rest/api/3/search/jql (the old GET /search returns 410).

export type RawJiraIssue = {
  key: string;
  fields: Record<string, unknown>;
};

type SearchJqlResponse = {
  issues: RawJiraIssue[];
  nextPageToken?: string;
  isLast: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} (set it in .env.local)`);
  }
  return value;
}

function authHeader(): string {
  const email = requireEnv("JIRA_EMAIL");
  const token = requireEnv("JIRA_API_TOKEN");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function baseUrl(): string {
  return requireEnv("JIRA_BASE_URL").replace(/\/$/, "");
}

async function jiraFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    // Never include the Authorization header value here.
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA request to ${path} failed with ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return res;
}

/** All subtasks/child issues of `parentKey`, paginated via nextPageToken
 *  until exhausted. */
export async function searchSubtasks(
  parentKey: string,
  fields: string[] = ["summary", "status", "assignee", "issuetype", "updated"],
): Promise<RawJiraIssue[]> {
  const issues: RawJiraIssue[] = [];
  let pageToken: string | undefined;

  do {
    const res = await jiraFetch("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql: `parent = ${parentKey} ORDER BY created ASC`,
        fields,
        maxResults: 100,
        ...(pageToken ? { nextPageToken: pageToken } : {}),
      }),
    });
    const data = (await res.json()) as SearchJqlResponse;
    issues.push(...data.issues);
    pageToken = data.isLast ? undefined : data.nextPageToken;
  } while (pageToken);

  return issues;
}

/** Fetches a single issue by key (used for parent/feature tickets, to read
 *  their description for AC extraction via src/lib/adf.ts). */
export async function getIssue(
  key: string,
  fields: string[] = ["summary", "description", "status"],
): Promise<RawJiraIssue> {
  const res = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields.join(",")}`);
  return (await res.json()) as RawJiraIssue;
}
