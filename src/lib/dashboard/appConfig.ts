// src/lib/dashboard/appConfig.ts
// The pipeline's config.yaml, made readable from the browser.
//
// src/lib/config.ts reads the same file with `fs` for the Node collection
// scripts; that can't work in a prerendered page or after hydration. The
// `virtual:app-config` module (see appConfigPlugin in vite.config.ts)
// resolves the YAML to plain JS at build time instead, so no parser ships
// to the client. Both paths validate through the same zod schema, so a
// config the pipeline accepts and a config this page renders can never
// diverge.
//
// config.yaml holds no secrets by construction — credentials live in
// .env.local, which is gitignored and never imported here.
import { appConfig, appConfigSource, jiraBaseUrl } from "virtual:app-config";
import { Config } from "../config-schema.ts";

export type AppConfig = Config;

/** The raw YAML text, for showing the file as it is actually written —
 *  comments and all, which is most of the documentation this file has. */
export const configSource: string = appConfigSource;

/** `https://<org>.atlassian.net/browse/BOUN-1234` for any ticket key, or
 *  null if JIRA_BASE_URL isn't set (a checkout without .env.local) — every
 *  caller must handle null by rendering the title unlinked rather than
 *  guessing at a host. */
export function jiraIssueUrl(key: string): string | null {
  return jiraBaseUrl ? `${jiraBaseUrl}/browse/${encodeURIComponent(key)}` : null;
}

/** `https://github.com/<org>/<repo>/pull/<n>` for an AcCoverage.evidence
 *  entry shaped like `"repo#123"` (see schema.ts) — the other shape that
 *  array holds is a bare JIRA key, which this returns null for so callers
 *  fall back to `jiraIssueUrl`. */
export function githubPrUrl(evidence: string): string | null {
  const match = /^(.+)#(\d+)$/.exec(evidence);
  if (!match) return null;
  const [, repo, number] = match;
  return `https://github.com/${loadAppConfig().github.org}/${repo}/pull/${number}`;
}

let parsed: Config | null = null;

/** Validated config. Parsed once and memoised: several components read it
 *  and there's no reason to re-run zod for each. */
export function loadAppConfig(): Config {
  parsed ??= Config.parse(appConfig);
  return parsed;
}

let loginsByDisplayName: Map<string, string> | null = null;

/** The GitHub login behind a display name, or null if config.yaml doesn't
 *  map one.
 *
 *  Snapshots store `feature.owner` already humanised (scripts/merge.ts
 *  swaps the login for `config.people[login]`), so going the other way is
 *  the only route from a rendered name back to an avatar. Reviewers need
 *  none of this — GitHub review requests are logins to begin with.
 *
 *  Reads the `people` block directly rather than going through
 *  loadAppConfig(): owner avatars render on nearly every page, and a
 *  config that fails full validation should break the Config page, not
 *  take down the whole dashboard over a missing profile picture. */
export function loginForDisplayName(displayName: string): string | null {
  if (!loginsByDisplayName) {
    const people = (appConfig as { people?: Record<string, unknown> } | null)?.people ?? {};
    loginsByDisplayName = new Map(
      Object.entries(people)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([login, name]) => [name, login]),
    );
  }
  return loginsByDisplayName.get(displayName) ?? null;
}

/** The GitHub login behind a JIRA assignee's `displayName`, or null if
 *  config.yaml's `jiraAssignees` doesn't map one.
 *
 *  Separate from loginForDisplayName: that one reverses `people`, whose
 *  values are short first names ("Ruzzell") because owners are humanised
 *  through it at merge time. Ticket assignees never go through that
 *  humanisation — they're JIRA's raw `displayName` ("Ruzzell Widjaja",
 *  or for one person a bare username, "vivek.murarka") — so reusing
 *  `people` here would never match. */
export function loginForJiraAssignee(displayName: string): string | null {
  const jiraAssignees = (appConfig as { jiraAssignees?: Record<string, unknown> } | null)?.jiraAssignees ?? {};
  const login = jiraAssignees[displayName];
  return typeof login === "string" ? login : null;
}

let colorsByLogin: Map<string, string> | null = null;

/** The subtle background colour for a GitHub login, or null if
 *  config.yaml's `peopleColors` doesn't have one — the caller then falls
 *  back to no tint at all rather than guessing a colour.
 *
 *  Reads `peopleColors` directly rather than going through
 *  loadAppConfig(), same reasoning as loginForDisplayName: a badge colour
 *  is decoration, not something a config error should be able to take the
 *  whole dashboard down over. */
export function colorForLogin(login: string): string | null {
  if (!colorsByLogin) {
    const peopleColors = (appConfig as { peopleColors?: Record<string, unknown> } | null)?.peopleColors ?? {};
    colorsByLogin = new Map(
      Object.entries(peopleColors).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }
  return colorsByLogin.get(login) ?? null;
}
