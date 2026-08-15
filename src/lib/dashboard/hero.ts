// src/lib/dashboard/hero.ts
// The Today page's opening summary, composed as a sentence rather than a
// grid: counts read inline, in the order a person would say them, and the
// sentence degrades to whatever is actually true today rather than
// printing "0 shipped, 0 stalled" on a quiet morning.
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import type { ChangeItem } from "./diff.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

/** Which glyph a clause carries. A key, not a component, so this module
 *  stays free of React and testable on its own — Hero.tsx maps these to
 *  icons (see CLAUSE_ICONS there). */
export type HeroIcon = "story" | "feature" | "approved" | "with_product" | "unproven" | "backwards" | "stalled" | "review";

/**
 * One counted thing inside the sentence, split where the colour stops.
 *
 * `count` and `noun` are drawn in the clause's status hue along with its
 * icon; `tail` is the predicate and stays in body colour. Colouring the
 * whole clause made the sentence read as a highlighted list rather than a
 * sentence — the hue should mark *what* is being counted, not narrate.
 */
export type HeroClause = {
  count: number;
  /** The counted noun: "story", "features", "reviews". Coloured. */
  noun: string;
  /** What happened to them: "shipped", "are waiting". Not coloured. */
  tail: string;
  status: string;
  icon: HeroIcon;
};

export type HeroSummary = {
  /** Counted movements since the previous snapshot. Empty when nothing
   *  moved. */
  movement: HeroClause[];
  /** Standing facts, not movement: reviews waiting, work sitting with
   *  product, blocked stories. */
  standing: HeroClause[];
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

const story = (n: number) => plural(n, "story", "stories");
const feature = (n: number) => plural(n, "feature", "features");

export function buildHeroSummary(snapshot: StatusSnapshotT, changes: ChangeItem[]): HeroSummary {
  const count = (kind: ChangeItem["kind"]) => changes.filter((c) => c.kind === kind).length;

  const movement: HeroClause[] = (
    [
      // Purple, not the status family's green: this counts code that
      // reached master, the same thing the PR chips below it are about.
      { count: count("shipped"), noun: story(count("shipped")), tail: "shipped", status: "pr_shipped", icon: "story" },
      {
        count: count("released"),
        noun: feature(count("released")),
        tail: "signed off",
        status: "shipped",
        icon: "approved",
      },
      {
        count: count("sent_for_sign_off"),
        noun: feature(count("sent_for_sign_off")),
        tail: "sent to product",
        status: "in_review",
        icon: "with_product",
      },
      {
        count: count("newly_done_unverified"),
        noun: story(count("newly_done_unverified")),
        tail: "marked Done without a PR",
        status: "done_unverified",
        icon: "unproven",
      },
      // Story and feature regressions stay separate clauses: "3 stories
      // moved backwards and 1 feature slipped" says which level came
      // apart, where a folded "4 moved backwards" left the reader to
      // guess.
      {
        count: count("regressed"),
        noun: story(count("regressed")),
        tail: "moved backwards",
        status: "blocked",
        icon: "backwards",
      },
      {
        count: count("feature_regressed"),
        noun: feature(count("feature_regressed")),
        tail: "slipped",
        status: "blocked",
        icon: "backwards",
      },
      {
        count: count("newly_stalled"),
        noun: feature(count("newly_stalled")),
        tail: "stalled",
        status: "blocked",
        icon: "stalled",
      },
    ] satisfies HeroClause[]
  ).filter((clause) => clause.count > 0);

  const blocked = snapshot.features.reduce((sum, f) => sum + f.scoreBasis.blocked, 0);
  const awaiting = snapshot.features.filter((f) => f.awaitingSignOff).length;
  // Review *requests*, not stories in review: one entry per reviewer per
  // open PR, which is the number of people who owe something. The strip
  // below counts stories, and labels itself "Stories in review" so the
  // two figures can't be read as the same fact.
  const reviewRequests = snapshot.reviewQueue.length;

  const standing: HeroClause[] = (
    [
      {
        count: reviewRequests,
        noun: plural(reviewRequests, "review", "reviews"),
        tail: plural(reviewRequests, "is waiting", "are waiting"),
        status: "in_review",
        icon: "review",
      },
      {
        count: awaiting,
        noun: feature(awaiting),
        tail: plural(awaiting, "is with product", "are with product"),
        status: "in_review",
        icon: "with_product",
      },
      {
        count: blocked,
        noun: story(blocked),
        tail: plural(blocked, "is blocked", "are blocked"),
        status: "blocked",
        icon: "backwards",
      },
    ] satisfies HeroClause[]
  ).filter((clause) => clause.count > 0);

  return { movement, standing };
}
