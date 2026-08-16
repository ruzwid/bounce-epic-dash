// src/lib/dashboard/people.ts
// The epic read by person rather than by ticket.
//
// Every other page in this dashboard is organised around work: features,
// stories, pull requests. A lead manages people, and the questions they
// actually ask — who is carrying the most, who is blocked on someone
// else, whose queue is the reason nothing is moving — cannot be answered
// by scanning any of those pages.
//
// Identity here is a GitHub login wherever one is known. JIRA owners
// arrive as display names and GitHub authors as logins; config.yaml's
// `people` map is the only bridge between them, so a person with no entry
// there stays visible under their display name rather than being dropped.
import type { z } from "zod";
import type {
  Feature as FeatureSchema,
  PrRef as PrRefSchema,
  StatusSnapshot as StatusSnapshotSchema,
  Story as StorySchema,
} from "../schema.ts";
import { storyPrs } from "../stories.ts";
import { loginForDisplayName } from "./appConfig.ts";
import { reviewersForPr, type ReviewerStatus } from "./nav.ts";
import { needsAttention, prOpenDays } from "./search.ts";
import { storyTotals, type StoryTotals } from "./totals.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type PrRefT = z.infer<typeof PrRefSchema>;
type StoryT = z.infer<typeof StorySchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

export type PersonLoad = {
  /** GitHub login when known — the key everything else joins on. */
  login: string | null;
  /** What to call them: the config.yaml display name, else the login. */
  name: string;
  /** Features where this person is the named owner. */
  features: FeatureT[];
  /** How many of those are finished — stage "done", the same bar the
   *  milestone and epic figures use, so "5 of 9" here and a green
   *  milestone bar can't disagree about what finished means. */
  featuresShipped: number;
  /** Story counts across those features. */
  totals: StoryTotals;
  /** Features of theirs that need attention right now. */
  needsAttention: FeatureT[];
  /** Open pull requests they wrote. */
  authored: PrRefT[];
  /** Of those, the ones with a reviewer requested — they are waiting on
   *  someone else. */
  awaitingReview: PrRefT[];
  /** Review requests pointed at this person: someone else is waiting on
   *  them. One entry per pull request, not per request. */
  reviewing: { pr: PrRefT; ageDays: number }[];
  /** The other direction: everyone who has been asked to review one of
   *  their open pull requests. Logins, de-duplicated across PRs — this is
   *  "who is this person waiting on", the question `reviewing` answers
   *  backwards. */
  waitingOn: string[];
  /** The oldest review they owe, in days — the number that says whether
   *  they are a bottleneck. Null when they owe none. */
  oldestReviewDays: number | null;
  /** When they last got something onto a default branch, as an ISO
   *  timestamp. Null when nothing of theirs has ever merged. */
  lastShippedAt: string | null;
};

/** Every pull request in the snapshot, de-duplicated by repo + number: a
 *  PR can be attached to a story and to that story's sub-task, and it is
 *  still one pull request. */
function allPrs(snapshot: StatusSnapshotT): PrRefT[] {
  const byId = new Map<string, PrRefT>();
  for (const feature of snapshot.features) {
    for (const story of feature.stories) {
      for (const pr of storyPrs(story)) byId.set(`${pr.repo}#${pr.number}`, pr);
    }
  }
  return [...byId.values()];
}

/**
 * One row per person who appears anywhere in the snapshot — as a feature
 * owner, a pull request author, or a requested reviewer.
 *
 * Sorted by how much is on them: features owned first, then reviews owed.
 * That ordering is the point of the page, so it lives here rather than in
 * the component, where a later "sort by name" toggle would quietly become
 * the only ordering anyone maintained.
 */
export function peopleLoad(snapshot: StatusSnapshotT, asOf: Date): PersonLoad[] {
  const prs = allPrs(snapshot);
  const byLogin = new Map<string, PersonLoad>();
  const displayNameByLogin = new Map<string, string>();

  const blank = (login: string | null, name: string): PersonLoad => ({
    login,
    name,
    features: [],
    featuresShipped: 0,
    totals: storyTotals([]),
    needsAttention: [],
    authored: [],
    awaitingReview: [],
    reviewing: [],
    waitingOn: [],
    oldestReviewDays: null,
    lastShippedAt: null,
  });

  /** Rows are keyed by login when there is one, and by display name when
   *  there isn't — so an engineer with no config.yaml entry is still a
   *  row of their own rather than being folded into a shared "unknown". */
  const row = (login: string | null, name: string): PersonLoad => {
    const key = login ?? `name:${name}`;
    const existing = byLogin.get(key);
    if (existing) return existing;
    const created = blank(login, name);
    byLogin.set(key, created);
    return created;
  };

  for (const feature of snapshot.features) {
    const login = loginForDisplayName(feature.owner);
    if (login) displayNameByLogin.set(login, feature.owner);
    const person = row(login, feature.owner);
    person.features.push(feature);
    if (needsAttention(feature, asOf)) person.needsAttention.push(feature);
  }

  for (const pr of prs) {
    if (pr.author) {
      const person = row(pr.author, displayNameByLogin.get(pr.author) ?? pr.author);
      if (pr.state === "OPEN") {
        person.authored.push(pr);
        if (pr.reviewRequests.length > 0) person.awaitingReview.push(pr);
      }
      if (pr.shippedToDefault && pr.mergedAt) {
        if (person.lastShippedAt === null || pr.mergedAt > person.lastShippedAt) {
          person.lastShippedAt = pr.mergedAt;
        }
      }
    }
  }

  // Reviews come from the published queue rather than pr.reviewRequests so
  // the ages match the Reviews page exactly — they are computed once, at
  // merge time, against the snapshot's own instant.
  const seenReview = new Set<string>();
  for (const request of snapshot.reviewQueue) {
    const key = `${request.reviewer}:${request.pr.repo}#${request.pr.number}`;
    if (seenReview.has(key)) continue;
    seenReview.add(key);
    const person = row(request.reviewer, displayNameByLogin.get(request.reviewer) ?? request.reviewer);
    person.reviewing.push({ pr: request.pr, ageDays: request.ageDays });
  }

  for (const person of byLogin.values()) {
    person.totals = storyTotals(person.features);
    person.featuresShipped = person.features.filter((feature) => feature.stage === "done").length;
    person.reviewing.sort((a, b) => b.ageDays - a.ageDays);
    person.oldestReviewDays = person.reviewing[0]?.ageDays ?? null;
    person.waitingOn = [...new Set(person.awaitingReview.flatMap((pr) => pr.reviewRequests))].sort();
    if (person.login) person.name = displayNameByLogin.get(person.login) ?? person.name;
  }

  return [...byLogin.values()].sort(
    (a, b) =>
      b.features.length - a.features.length ||
      b.reviewing.length - a.reviewing.length ||
      b.authored.length - a.authored.length ||
      a.name.localeCompare(b.name),
  );
}

/** A story is "moving" when JIRA has it anywhere between picked up and
 *  merged — the three statuses that mean someone is spending time on it
 *  this week. */
const MOVING = new Set(["in_progress", "in_review", "staged"]);

export type PrWork = {
  pr: PrRefT;
  /** Everyone with a stake in it, in the same shape the Reviews page's
   *  reviewer badges take — so a person's own card shows the same review
   *  state as the queue does, rather than a second opinion of it. */
  reviewers: ReviewerStatus[];
  /** True when this person wrote it: their own card should distinguish
   *  "my PR, waiting on Vivek" from "a PR someone else opened on my
   *  story". */
  mine: boolean;
  /** How long it has been open, in whole days. Taken from the published
   *  review queue when the PR is in it, so a PR shown here and on the
   *  Reviews page never claims two different ages; computed against the
   *  snapshot's own instant otherwise. */
  openDays: number;
};

export type StoryWork = { story: StoryT; prs: PrWork[] };

export type FeatureWork = {
  feature: FeatureT;
  /** True when this person is the feature's named owner. False for a
   *  feature they only appear in because they opened a pull request on
   *  somebody else's story. */
  owned: boolean;
  stories: StoryWork[];
};

/**
 * What this person is actually working on right now, feature by feature.
 *
 * Two things used to be listed separately — the moving stories of features
 * they own, and the open pull requests they wrote — and reading them side
 * by side meant matching PR numbers to ticket keys by eye. They are the
 * same work: a story moves *because* there is a PR on it. So a story
 * appears here when it is moving on a feature they own, or when they have
 * an open PR against it (even on somebody else's feature), and every open
 * PR hangs underneath the ticket it belongs to.
 */
export function workInFlight(person: PersonLoad, snapshot: StatusSnapshotT, asOf: Date): FeatureWork[] {
  const waitingByPr = new Map<string, { reviewer: string; ageDays: number }[]>();
  for (const request of snapshot.reviewQueue) {
    const key = `${request.pr.repo}#${request.pr.number}`;
    const list = waitingByPr.get(key) ?? [];
    list.push({ reviewer: request.reviewer, ageDays: request.ageDays });
    waitingByPr.set(key, list);
  }

  const ownedKeys = new Set(person.features.map((feature) => feature.key));
  const work: FeatureWork[] = [];

  for (const feature of snapshot.features) {
    const owned = ownedKeys.has(feature.key);
    const stories: StoryWork[] = [];

    for (const story of feature.stories) {
      const open = storyPrs(story).filter((pr) => pr.state === "OPEN");
      const theirs = open.filter((pr) => person.login !== null && pr.author === person.login);
      const moving = owned && MOVING.has(story.status);
      if (!moving && theirs.length === 0) continue;

      // Their own story shows every open PR on it, including one a
      // colleague opened — that is exactly the thing they would be asked
      // about at standup. A story they only touched shows just their PRs.
      const shown = moving ? open : theirs;
      stories.push({
        story,
        prs: shown.map((pr) => {
          const waiting = waitingByPr.get(`${pr.repo}#${pr.number}`) ?? [];
          return {
            pr,
            reviewers: reviewersForPr(pr, waiting),
            mine: person.login !== null && pr.author === person.login,
            openDays: waiting.length > 0
              ? Math.max(...waiting.map((w) => w.ageDays))
              : Math.floor(prOpenDays(pr, asOf)),
          };
        }),
      });
    }

    if (stories.length > 0) work.push({ feature, owned, stories });
  }

  // Their own features first; snapshot order within each half, which is
  // the same order the sidebar and every other page lists features in.
  return work.sort((a, b) => Number(b.owned) - Number(a.owned));
}
