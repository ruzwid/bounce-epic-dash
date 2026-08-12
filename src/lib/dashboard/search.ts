// src/lib/dashboard/search.ts
// Filter state lives entirely in the URL (goal: "Filters are URL state").
// The zod schema below is passed directly to each route's validateSearch —
// no @tanstack/zod-adapter needed, since we're not using its zodValidator()
// helper (that's the thing that breaks .catch() type inference; a raw
// schema passed straight to validateSearch keeps it).
import { z } from "zod";
import type { Feature as FeatureSchema } from "../schema.ts";

export const dashboardSearchSchema = z.object({
  // M3 and M4 share one filter value: they're both Tony's light-tier
  // platform work and are always read together.
  milestone: z.enum(["all", "m1", "m2", "m3-m4"]).default("all").catch("all"),
  engineer: z.string().nullable().default(null),
  needsAttention: z.boolean().default(false),
  q: z.string().default(""),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;
type FeatureT = z.infer<typeof FeatureSchema>;

const STALL_DAYS = 7;
const REVIEW_WAIT_DAYS = 2;

function daysBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60 * 24);
}

/** blocked, stalled >7d (and not already done), a PR waiting on review
 *  >2d, or any open callout. Matches the goal's "Needs attention only"
 *  toggle definition exactly. */
export function needsAttention(feature: FeatureT, now: Date): boolean {
  if (feature.scoreBasis.blocked > 0) return true;
  if (feature.stage !== "done" && feature.daysSinceLastActivity !== null && feature.daysSinceLastActivity > STALL_DAYS) {
    return true;
  }
  if (feature.callouts.length > 0) return true;

  const waitingOnReview = feature.subtasks.some((subtask) =>
    subtask.prs.some(
      (pr) => pr.state === "OPEN" && pr.reviewRequests.length > 0 && daysBetween(pr.updatedAt, now) > REVIEW_WAIT_DAYS,
    ),
  );
  return waitingOnReview;
}

export function matchesFilters(feature: FeatureT, search: DashboardSearch, now: Date): boolean {
  if (search.milestone === "m1" && feature.milestone !== "M1") return false;
  if (search.milestone === "m2" && feature.milestone !== "M2") return false;
  if (search.milestone === "m3-m4" && feature.milestone !== "M3" && feature.milestone !== "M4") return false;
  if (search.engineer !== null && feature.owner !== search.engineer) return false;
  if (search.needsAttention && !needsAttention(feature, now)) return false;

  if (search.q.trim().length > 0) {
    const q = search.q.trim().toLowerCase();
    const haystack = `${feature.title} ${feature.code} ${feature.key}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}
