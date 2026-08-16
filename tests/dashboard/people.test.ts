import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../../src/lib/schema.ts";
import { peopleLoad, workInFlight } from "../../src/lib/dashboard/people.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const AS_OF = new Date("2026-08-14T08:00:00Z");

/** config.yaml maps these display names back to logins — peopleLoad joins
 *  a JIRA owner to a GitHub author through that map, so the fixtures have
 *  to use names it actually knows. */
const RUZZELL = { name: "Ruzzell", login: "ruzwid" };
const TOMER = { name: "Tomer", login: "gelbh" };

function pr(
  number: number,
  author: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    repo: "dashboard-api",
    number,
    title: `PR ${number}`,
    url: `https://github.com/org/dashboard-api/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    baseRef: "master",
    headRef: `branch-${number}`,
    shippedToDefault: false,
    mergedAt: null,
    createdAt: "2026-08-13T08:00:00Z",
    updatedAt: "2026-08-13T08:00:00Z",
    stackChain: [],
    reviewRequests: [],
    reviews: [],
    author,
    filesTouched: [],
    ...overrides,
  };
}

function story(key: string, status: string, prs: ReturnType<typeof pr>[] = []) {
  return { key, summary: `${key} summary`, status, assignee: null, prs, subtasks: [] };
}

function feature(code: string, owner: string, stories: ReturnType<typeof story>[]) {
  return {
    key: `BOUN-${code}`,
    code,
    title: `${code} — A feature`,
    owner,
    milestone: "M1",
    stage: "underway",
    score: 50,
    dataOk: true,
    daysSinceLastActivity: 1,
    callouts: [],
    stories,
    scoreBasis: {
      shipped: 0,
      doneUnverified: 0,
      staged: 0,
      inReview: 0,
      inProgress: 0,
      blocked: 0,
      todo: stories.length,
      total: stories.length,
    },
  };
}

function snapshot(
  features: ReturnType<typeof feature>[],
  reviewQueue: unknown[] = [],
): StatusSnapshotT {
  return { date: "2026-08-14", features, reviewQueue, milestones: [] } as unknown as StatusSnapshotT;
}

function personIn(snap: StatusSnapshotT, login: string) {
  return peopleLoad(snap, AS_OF).find((p) => p.login === login)!;
}

describe("workInFlight", () => {
  it("shows every open PR on a moving story of a feature they own, whoever wrote it", () => {
    const snap = snapshot([
      feature("F1.1", RUZZELL.name, [story("S-1", "in_review", [pr(1, RUZZELL.login), pr(2, TOMER.login)])]),
    ]);

    const work = workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF);

    expect(work).toHaveLength(1);
    expect(work[0]!.owned).toBe(true);
    expect(work[0]!.stories[0]!.prs.map((p) => [p.pr.number, p.mine])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("includes somebody else's feature when they have a PR on it, showing only their own PR", () => {
    const snap = snapshot([
      feature("F1.1", TOMER.name, [story("S-1", "in_progress", [pr(1, RUZZELL.login), pr(2, TOMER.login)])]),
    ]);

    const work = workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF);

    expect(work).toHaveLength(1);
    expect(work[0]!.owned).toBe(false);
    expect(work[0]!.stories[0]!.prs.map((p) => p.pr.number)).toEqual([1]);
  });

  it("leaves out a story that is neither moving nor carrying a PR of theirs", () => {
    const snap = snapshot([
      feature("F1.1", RUZZELL.name, [story("S-1", "todo"), story("S-2", "shipped", [pr(9, TOMER.login)])]),
    ]);

    expect(workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF)).toEqual([]);
  });

  it("lists features they own before features they only wrote a PR on", () => {
    const snap = snapshot([
      feature("F1.1", TOMER.name, [story("S-1", "in_progress", [pr(1, RUZZELL.login)])]),
      feature("F1.2", RUZZELL.name, [story("S-2", "in_progress")]),
    ]);

    expect(workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF).map((w) => w.feature.code)).toEqual([
      "F1.2",
      "F1.1",
    ]);
  });

  it("takes a queued PR's age from the review queue, so it matches the Reviews page", () => {
    const waiting = pr(1, RUZZELL.login, { updatedAt: "2026-08-14T07:00:00Z" });
    const snap = snapshot(
      [feature("F1.1", RUZZELL.name, [story("S-1", "in_review", [waiting])])],
      [{ pr: waiting, featureKey: "BOUN-F1.1", reviewer: TOMER.login, requestedAt: "2026-08-10T08:00:00Z", ageDays: 4 }],
    );

    const work = workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF);
    const [entry] = work[0]!.stories[0]!.prs;

    expect(entry!.openDays).toBe(4);
    expect(entry!.reviewers).toEqual([{ reviewer: TOMER.login, state: "requested", ageDays: 4 }]);
  });

  it("falls back to the snapshot's own instant for a PR nobody has been asked to review", () => {
    const snap = snapshot([
      feature("F1.1", RUZZELL.name, [story("S-1", "in_review", [pr(1, RUZZELL.login, { createdAt: "2026-08-11T08:00:00Z" })])]),
    ]);

    const work = workInFlight(personIn(snap, RUZZELL.login), snap, AS_OF);

    expect(work[0]!.stories[0]!.prs[0]!.openDays).toBe(3);
    expect(work[0]!.stories[0]!.prs[0]!.reviewers).toEqual([]);
  });
});
