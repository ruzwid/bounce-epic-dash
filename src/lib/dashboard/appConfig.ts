// src/lib/dashboard/appConfig.ts
// Every epic's config.yaml, made readable from the browser.
//
// src/lib/config.ts reads the same files with `fs` for the Node collection
// scripts; that can't work in a prerendered page or after hydration. The
// `virtual:app-config` module (see appConfigPlugin in vite.config.ts)
// resolves the YAML to plain JS at build time instead, so neither a parser
// nor a validator ships to the client. Both paths still validate through
// the same zod schema — the pipeline at collection time, the plugin at
// build time — so a config the pipeline accepts and a config this page
// renders can never diverge.
//
// Every lookup here takes an epic slug first. There is deliberately no
// "current epic" module state: a prerender renders several epics' pages in
// one process, so an implicit current-epic would be a cross-request global
// waiting to hand one team's avatars to another team's page. Components
// read the slug from `useShell()` and pass it in.
//
// config.yaml holds no secrets by construction — credentials live in
// .env.local, which is gitignored and never imported here.
import { appConfigs, epicRegistry, jiraBaseUrl } from "virtual:app-config";
// Type-only: the values arrive already validated (see the plugin), so the
// schema itself — and zod with it — never reaches the browser.
import type { Config } from "../config-schema.ts";

export type AppConfig = Config;

/** Which epics this dashboard tracks, and which one "/" resolves to —
 *  epics.yaml, as read at build time. Drives the epic switcher. */
export const EPICS: string[] = epicRegistry.epics;
export const DEFAULT_EPIC: string = epicRegistry.default;

export function isKnownEpic(slug: string): boolean {
  return EPICS.includes(slug);
}

/** An epic's human title ("WPP at Scale") for chrome that has no snapshot
 *  in hand — page <title>s, the switcher, the unknown-epic page. Falls
 *  back to the slug, which is at least true. Anything rendering *inside* a
 *  loaded snapshot should prefer `snapshot.epic.title`, which is the live
 *  JIRA summary as of that collection run. */
export function epicTitle(slug: string): string {
  const epic = rawConfig(slug).epic;
  const title = epic && typeof epic === "object" ? (epic as { title?: unknown }).title : undefined;
  return typeof title === "string" && title.length > 0 ? title : slug;
}

/** `https://<org>.atlassian.net/browse/BOUN-1234` for any ticket key, or
 *  null if JIRA_BASE_URL isn't set (a checkout without .env.local) — every
 *  caller must handle null by rendering the title unlinked rather than
 *  guessing at a host. Not epic-scoped: every tracked epic lives on the
 *  same JIRA site. */
export function jiraIssueUrl(key: string): string | null {
  return jiraBaseUrl ? `${jiraBaseUrl}/browse/${encodeURIComponent(key)}` : null;
}

/** `https://github.com/<org>/<repo>/pull/<n>` for an AcCoverage.evidence
 *  entry shaped like `"repo#123"` (see schema.ts) — the other shape that
 *  array holds is a bare JIRA key, which this returns null for so callers
 *  fall back to `jiraIssueUrl`. */
export function githubPrUrl(epic: string, evidence: string): string | null {
  const match = /^(.+)#(\d+)$/.exec(evidence);
  if (!match) return null;
  const [, repo, number] = match;
  return `https://github.com/${loadAppConfig(epic).github.org}/${repo}/pull/${number}`;
}

/** One epic's config, already validated — the plugin that emits these
 *  runs each through the zod schema at build time and fails the build on a
 *  bad one, so this is a lookup rather than a parse. */
export function loadAppConfig(epic: string): Config {
  if (!isKnownEpic(epic)) {
    // An unknown slug is named explicitly rather than left to surface as
    // an undefined-property crash three frames deeper, which says nothing
    // about the actual mistake.
    throw new Error(
      `No config for epic "${epic}". Known epics: ${EPICS.join(", ")}. ` +
        `A snapshot's epic slug comes from the directory it was loaded from, so this usually means ` +
        `data/snapshots/${epic}/ exists without a matching entry in epics.yaml.`,
    );
  }
  return appConfigs[epic]!;
}

/** One epic's config as a bag of fields, or an empty object for an
 *  unknown slug.
 *
 *  The lookups below read this rather than going through loadAppConfig()
 *  so that an unknown slug returns "no avatar" instead of throwing: owner
 *  avatars and milestone chips render on nearly every page, and a stale
 *  link to a removed epic should land on the shell's own "no epic called
 *  …" page rather than taking the render down from inside a tooltip.
 *
 *  The `unknown` field types are about that missing-epic case only. What
 *  is present has already been validated against the schema at build
 *  time — see the note at the top of this file. */
function rawConfig(epic: string): Record<string, unknown> {
  const config = appConfigs[epic];
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}

/** An epic's configured milestones, reduced to the two fields the sidebar
 *  and milestone filter need, or empty for an unknown epic. Read directly
 *  rather than through loadAppConfig() for the same reason as the lookups
 *  below: how sections are grouped is chrome, and a config error should
 *  break the Config page rather than the whole dashboard. */
export function configMilestones(epic: string): { id: string; group: string | null }[] {
  const milestones = rawConfig(epic).milestones;
  if (!Array.isArray(milestones)) return [];
  return milestones.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, group } = entry as { id?: unknown; group?: unknown };
    if (typeof id !== "string") return [];
    return [{ id, group: typeof group === "string" ? group : null }];
  });
}

function stringMap(epic: string, block: string): Record<string, string> {
  const value = rawConfig(epic)[block];
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

const loginsByDisplayName = new Map<string, Map<string, string>>();

/** The GitHub login behind a display name, or null if this epic's config
 *  doesn't map one.
 *
 *  Snapshots store `feature.owner` already humanised (scripts/merge.ts
 *  swaps the login for `config.people[login]`), so going the other way is
 *  the only route from a rendered name back to an avatar. Reviewers need
 *  none of this — GitHub review requests are logins to begin with. */
export function loginForDisplayName(epic: string, displayName: string): string | null {
  let reversed = loginsByDisplayName.get(epic);
  if (!reversed) {
    reversed = new Map(Object.entries(stringMap(epic, "people")).map(([login, name]) => [name, login]));
    loginsByDisplayName.set(epic, reversed);
  }
  return reversed.get(displayName) ?? null;
}

/** The short display name this epic's `people` block gives a GitHub login
 *  ("ruzwid" -> "Ruzzell"), or null when it lists none — review-only logins
 *  and bots have no entry, and a caller showing one falls back to the login
 *  itself rather than inventing a name.
 *
 *  The forward direction of loginForDisplayName above. */
export function displayNameForLogin(epic: string, login: string): string | null {
  return stringMap(epic, "people")[login] ?? null;
}

/** The GitHub login behind a JIRA assignee's `displayName`, or null if
 *  this epic's `jiraAssignees` doesn't map one.
 *
 *  Separate from loginForDisplayName: that one reverses `people`, whose
 *  values are short first names ("Ruzzell") because owners are humanised
 *  through it at merge time. Ticket assignees never go through that
 *  humanisation — they're JIRA's raw `displayName` ("Ruzzell Widjaja",
 *  or for one person a bare username, "vivek.murarka") — so reusing
 *  `people` here would never match. */
export function loginForJiraAssignee(epic: string, displayName: string): string | null {
  return stringMap(epic, "jiraAssignees")[displayName] ?? null;
}

/** The reader-facing places a person exists outside this dashboard.
 *
 *  Neither can be derived: JIRA Cloud dropped username/displayName from
 *  JQL, and nothing collected knows anyone's Slack identity, so both come
 *  from the epic config's `jiraAccounts` / `slackIds` maps and are simply
 *  absent until somebody fills them in. A missing link is a missing
 *  button; never a guessed URL that lands on an error page. */
export type PersonLinks = { jira: string | null; slack: string | null };

export function personLinks(epic: string, login: string): PersonLinks {
  const accountId = stringMap(epic, "jiraAccounts")[login];
  const slackId = stringMap(epic, "slackIds")[login];

  return {
    jira: jiraBaseUrl && accountId ? `${jiraBaseUrl}/jira/people/${encodeURIComponent(accountId)}` : null,
    // app_redirect rather than the slack:// scheme: it opens the desktop
    // app when it's installed and the web client when it isn't, instead of
    // failing silently in a browser that has no handler for the scheme.
    slack: slackId ? `https://slack.com/app_redirect?channel=${encodeURIComponent(slackId)}` : null,
  };
}

/** The subtle background colour for a GitHub login, or null if this epic's
 *  `peopleColors` doesn't have one — the caller then falls back to no tint
 *  at all rather than guessing a colour. */
export function colorForLogin(epic: string, login: string): string | null {
  return stringMap(epic, "peopleColors")[login] ?? null;
}
