// src/lib/dashboard/search.ts
// Filter state lives entirely in the URL (goal: "Filters are URL state").
// The zod schema below is passed directly to each route's validateSearch —
// no @tanstack/zod-adapter needed, since we're not using its zodValidator()
// helper (that's the thing that breaks .catch() type inference; a raw
// schema passed straight to validateSearch keeps it).
import { z } from "zod";
import type { Feature as FeatureSchema } from "../schema.ts";
import { storyPrs } from "../stories.ts";

export const dashboardSearchSchema = z.object({
  // M3 and M4 share one filter value: they're both Tony's light-tier
  // platform work and are always read together.
  milestone: z.enum(["all", "m1", "m2", "m3-m4"]).default("all").catch("all"),
  engineer: z.string().nullable().default(null),
  needsAttention: z.boolean().default(false),
  q: z.string().default(""),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

/** The value each filter takes when nothing is filtered.
 *
 *  Every field above has a default, which means a bare "/" validates to a
 *  fully-populated search object and the router rewrites the URL to match
 *  — turning every shared link into
 *  "/?milestone=all&engineer=null&needsAttention=false&q=". Pairing the
 *  defaults with stripSearchParams (see each shell route) keeps the
 *  defaults in code and out of the address bar, so "/" stays "/" and only
 *  filters the reader actually set are carried in a link. */
export const DASHBOARD_SEARCH_DEFAULTS: DashboardSearch = {
  milestone: "all",
  engineer: null,
  needsAttention: false,
  q: "",
};
type FeatureT = z.infer<typeof FeatureSchema>;

const STALL_DAYS = 7;
const REVIEW_WAIT_DAYS = 2;

function daysBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60 * 24);
}

/** blocked, stalled >7d (and not already done), a PR waiting on review
 *  >2d, or any open callout. Matches the goal's "Needs attention only"
 *  toggle definition exactly. A feature already stage "done" — whether by
 *  every story shipping or by product sign-off — never qualifies: a
 *  milestone/epic can only be "done" once every one of its features is,
 *  so this single check also covers "the milestone/epic isn't done"
 *  without needing a separate check at either level. Any residual
 *  drift (e.g. done_unverified stories under a signed-off feature) has
 *  its own lower-priority home — see signedOffUnverifiedStories. */
export function needsAttention(feature: FeatureT, now: Date): boolean {
  if (feature.stage === "done") return false;
  if (feature.scoreBasis.blocked > 0) return true;
  if (feature.daysSinceLastActivity !== null && feature.daysSinceLastActivity > STALL_DAYS) {
    return true;
  }
  if (feature.callouts.length > 0) return true;

  const waitingOnReview = feature.stories.some((story) =>
    storyPrs(story).some(
      (pr) => pr.state === "OPEN" && pr.reviewRequests.length > 0 && daysBetween(pr.updatedAt, now) > REVIEW_WAIT_DAYS,
    ),
  );
  return waitingOnReview;
}

/** The one place "does this milestone id satisfy the milestone filter"
 *  is decided — shared by matchesFilters (one feature) and
 *  groupMatchesMilestoneFilter (a whole sidebar/Today group) below, so
 *  the two can never disagree about what "m3-m4" means. */
function milestoneMatchesFilter(milestone: string, filter: DashboardSearch["milestone"]): boolean {
  if (filter === "all") return true;
  if (filter === "m1") return milestone === "M1";
  if (filter === "m2") return milestone === "M2";
  return milestone === "M3" || milestone === "M4";
}

export function matchesFilters(feature: FeatureT, search: DashboardSearch, now: Date): boolean {
  if (!milestoneMatchesFilter(feature.milestone, search.milestone)) return false;
  if (search.engineer !== null && feature.owner !== search.engineer) return false;
  if (search.needsAttention && !needsAttention(feature, now)) return false;

  if (search.q.trim().length > 0) {
    const q = search.q.trim().toLowerCase();
    const haystack = `${feature.title} ${feature.code} ${feature.key}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/** Whether a sidebar/Today milestone group has anything to show under the
 *  active milestone filter — true if any of its milestoneIds match.
 *  matchesFilters alone can't express this: it decides per-feature, so
 *  without this a milestone filter narrowed every group's feature list to
 *  zero but still rendered the group itself, empty. Picking "M1" now
 *  hides the M2/M3/M4 sections outright instead of rendering them empty. */
export function groupMatchesMilestoneFilter(milestoneIds: string[], search: DashboardSearch): boolean {
  return milestoneIds.some((id) => milestoneMatchesFilter(id, search.milestone));
}
