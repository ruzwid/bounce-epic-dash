// src/lib/dashboard/search.ts
// Filter state lives entirely in the URL (goal: "Filters are URL state").
// The validator below is passed directly to the shell route's
// validateSearch.
import type { z } from "zod";
import type { SearchSchemaInput } from "@tanstack/react-router";
import type { Feature as FeatureSchema, StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import { configMilestones } from "./appConfig.ts";
import { storyPrs } from "../stories.ts";

export type DashboardSearch = {
  /** "all", or a sidebar group slug ("m1", or "m3-m4" for milestones that
   *  share a `group` in their epic's config). Deliberately an open string
   *  rather than an enum: the valid values are whatever the *current
   *  epic's* milestones are, which a validator shared by every route can't
   *  enumerate. An unrecognised value matches nothing, so a stale link
   *  from another epic shows an empty list rather than silently falling
   *  back to unfiltered. */
  milestone: string;
  engineer: string | null;
  needsAttention: boolean;
  q: string;
};

/**
 * URL search params → the filter state, for the shell route's
 * validateSearch.
 *
 * Hand-written rather than a zod object. Search params are the one input
 * on this site that genuinely is untrusted — anyone can type anything into
 * an address bar — so validating them is not optional, but four fields of
 * it does not justify the ~75KB that shipping zod to the browser costs,
 * and this is the last thing that was asking for it. (The two other
 * runtime uses of the schemas are gone: configs are validated at build
 * time, snapshots when they're written and in CI.)
 *
 * Every field falls back rather than throwing. A hand-edited or
 * stale-shaped URL should show the dashboard unfiltered, which is a state
 * the reader can see and correct, not an error page.
 *
 * The parameter type is load-bearing and not merely descriptive. TanStack
 * reads a validator's *input* type to decide what a `<Link>` must pass,
 * and for a plain function it only looks there if that type carries the
 * `SearchSchemaInput` marker — otherwise it falls back to the return type,
 * whose four fields are all required, and every link in the app has to
 * spell out all four filters. `Partial<…> & SearchSchemaInput` is how a
 * function says what the zod version said with `.default()` on each field:
 * callers may pass any subset, including none.
 *
 * What actually arrives at runtime is whatever was in the URL, so the body
 * still treats every field as unknown — the annotation is a contract for
 * callers building links, not a promise about the address bar.
 */
export function dashboardSearchSchema(input: Partial<DashboardSearch> & SearchSchemaInput): DashboardSearch {
  const raw = input as Record<string, unknown>;
  return {
    milestone: typeof raw.milestone === "string" ? raw.milestone : "all",
    engineer: typeof raw.engineer === "string" ? raw.engineer : null,
    // The router's parser turns "?needsAttention=true" into a real boolean,
    // but a hand-typed URL can leave it a string; both mean the same thing
    // to a reader and are read the same way here.
    needsAttention: raw.needsAttention === true || raw.needsAttention === "true",
    q: typeof raw.q === "string" ? raw.q : "",
  };
}

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
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const STALL_DAYS = 7;
const REVIEW_WAIT_DAYS = 2;

function daysBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60 * 24);
}

/** How long an open PR has been open, in days, as of the snapshot's own
 *  instant. Measured from createdAt: updatedAt moves every time anyone
 *  comments, labels or pushes, so a reviewer asking "any updates?" reset
 *  the age to zero and this check — the ">2 days waiting on review" rule —
 *  effectively never fired. Falls back to updatedAt on snapshots written
 *  before createdAt was published, which understates the wait rather than
 *  inventing one. */
export function prOpenDays(pr: { createdAt?: string | null; updatedAt: string }, asOf: Date): number {
  return daysBetween(pr.createdAt ?? pr.updatedAt, asOf);
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
export function needsAttention(feature: FeatureT, asOf: Date): boolean {
  if (feature.stage === "done") return false;
  if (feature.scoreBasis.blocked > 0) return true;
  if (feature.daysSinceLastActivity !== null && feature.daysSinceLastActivity > STALL_DAYS) {
    return true;
  }
  if (feature.callouts.length > 0) return true;

  const waitingOnReview = feature.stories.some((story) =>
    storyPrs(story).some(
      (pr) => pr.state === "OPEN" && pr.reviewRequests.length > 0 && prOpenDays(pr, asOf) > REVIEW_WAIT_DAYS,
    ),
  );
  return waitingOnReview;
}

/** A group key as it appears in a URL or filter value: "M1" -> "m1".
 *  Group keys written in an epic's config ("m3-m4") are already slugs;
 *  bare milestone ids are not. */
export function groupSlug(key: string): string {
  return key.toLowerCase();
}

/** The sidebar/filter group a milestone id belongs to, as a slug.
 *
 *  Three sources, in order: the group published in the snapshot; then the
 *  epic's current config; then the milestone's own id, meaning it stands
 *  alone. The config fallback is what keeps snapshots written before
 *  grouping was published rendering the way they always did — the same
 *  shape as resolveTargetDate (src/lib/dashboard/velocity.ts), which falls
 *  back to config for the same reason. Grouping is presentation, not
 *  measurement, so reading it from today's config on an old snapshot is
 *  correct rather than revisionist.
 *
 *  Lives here rather than in nav.ts because nav.ts already imports from
 *  this module (needsAttention, prOpenDays) and the reverse would be a
 *  cycle. It is the one place the filter and the sidebar agree on what a
 *  filter value covers, so the two can never disagree about what "m3-m4"
 *  means. */
export function milestoneGroupSlug(snapshot: StatusSnapshotT, milestoneId: string): string {
  const published = snapshot.milestones.find((m) => m.id === milestoneId)?.group;
  return groupSlug(published ?? configuredGroup(snapshot.epic.slug, milestoneId) ?? milestoneId);
}

/** The `group` an epic's config gives a milestone id today, or null.
 *  Reads the config block directly rather than through loadAppConfig() so
 *  a config that fails full validation can't take the sidebar down — same
 *  reasoning as the lookups in appConfig.ts. */
function configuredGroup(epic: string, milestoneId: string): string | null {
  for (const milestone of configMilestones(epic)) {
    if (milestone.id === milestoneId) return milestone.group ?? null;
  }
  return null;
}

export function matchesFilters(
  snapshot: StatusSnapshotT,
  feature: FeatureT,
  search: DashboardSearch,
  now: Date,
): boolean {
  if (search.milestone !== "all" && milestoneGroupSlug(snapshot, feature.milestone) !== search.milestone) {
    return false;
  }
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
 *  active milestone filter. matchesFilters alone can't express this: it
 *  decides per-feature, so without this a milestone filter narrowed every
 *  group's feature list to zero but still rendered the group itself,
 *  empty. Picking one group now hides the other sections outright instead
 *  of rendering them empty.
 *
 *  Takes the group's own slug (SidebarGroup.id), which sidebarGroups() has
 *  already resolved — the filter values *are* group slugs, so this is a
 *  direct comparison rather than a second, re-derived notion of grouping. */
export function groupMatchesMilestoneFilter(groupId: string, search: DashboardSearch): boolean {
  return search.milestone === "all" || search.milestone === groupId;
}
