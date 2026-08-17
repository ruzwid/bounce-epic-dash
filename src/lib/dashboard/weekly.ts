// src/lib/dashboard/weekly.ts
// The week, as opposed to the day.
//
// Today's page answers "what changed since yesterday", which is the right
// question at 9am and the wrong one on a Monday: a week of single-day
// diffs is eleven pages of noise, and the thing a lead actually has to
// write — what moved, what didn't, what it cost — is nowhere.
//
// Every figure here is a diff of two published snapshots, so a weekly
// number and the daily numbers that make it up can never disagree.
import type { z } from "zod";
import type { Feature as FeatureSchema, StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import type { ChangeItem } from "./diff.ts";
import { doneStories, storyTotals, weightedPercent } from "./totals.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

export type WeekTotals = {
  from: string;
  to: string;
  days: number;
  /** Stories that reached a default branch over the window. */
  shipped: number;
  /** Finished work, shipped plus Done-without-proof — the same pair the
   *  score weights at 1.0 and the burn-up plots. */
  done: number;
  /** Scope movement over the window. */
  stories: number;
  features: number;
  /** Weighted completion at each end (config.yaml scoreWeights), for
   *  the headline delta. */
  percentFrom: number;
  percentTo: number;
};

/** The same weighted figure the epic header shows, not a raw done/total:
 *  two percentages for the same epic on the same screen is one too many,
 *  and the header's is the one every other page agrees with. */
function percent(snapshot: StatusSnapshotT): number {
  return weightedPercent(snapshot.epic.slug, storyTotals(snapshot.features));
}

export function weekTotals(current: StatusSnapshotT, past: StatusSnapshotT): WeekTotals {
  const now = storyTotals(current.features);
  const then = storyTotals(past.features);
  const days = Math.max(
    1,
    Math.round((new Date(current.date).getTime() - new Date(past.date).getTime()) / (1000 * 60 * 60 * 24)),
  );

  return {
    from: past.date,
    to: current.date,
    days,
    shipped: now.shipped - then.shipped,
    done: doneStories(now) - doneStories(then),
    stories: now.total - then.total,
    features: current.features.length - past.features.length,
    percentFrom: percent(past),
    percentTo: percent(current),
  };
}

/**
 * Features nothing has happened to for the whole window.
 *
 * Not the same as the attention list: a feature can need attention for a
 * dozen reasons, most of them noisy day to day. This is the one that only
 * a week can tell you — nobody has touched it since before the window
 * opened, whatever its status says.
 */
export function untouchedAllWeek(current: StatusSnapshotT, days: number): FeatureT[] {
  return current.features
    .filter((f) => f.stage !== "done")
    .filter((f) => f.daysSinceLastActivity !== null && f.daysSinceLastActivity >= days)
    .sort((a, b) => (b.daysSinceLastActivity ?? 0) - (a.daysSinceLastActivity ?? 0));
}

/**
 * The week as text, for pasting into a status update.
 *
 * Markdown rather than Slack mrkdwn: a weekly update gets pasted into a
 * doc or a ticket at least as often as into Slack, and Slack renders
 * markdown links and bullets acceptably where a doc renders `*bold*` as a
 * literal asterisk. The Reviews page's exporter is the one that has to
 * speak all three dialects, because a review ping is always a chat
 * message.
 */
export function buildWeeklySummary(
  current: StatusSnapshotT,
  totals: WeekTotals,
  changes: ChangeItem[],
  stuck: FeatureT[],
): string {
  const lines: string[] = [];
  const count = (kind: ChangeItem["kind"]) => changes.filter((c) => c.kind === kind).length;

  lines.push(`## ${current.epic.title} — week to ${totals.to}`);
  lines.push("");

  const delta = totals.percentTo - totals.percentFrom;
  lines.push(
    `${totals.percentTo}% complete (${delta >= 0 ? "+" : ""}${delta} pts since ${totals.from}).`,
  );
  lines.push("");

  lines.push("**Moved**");
  if (totals.shipped > 0) lines.push(`- ${totals.shipped} stories shipped to master`);
  // A negative week is not an empty week: stories left the shipped count,
  // which is a fact somebody has to explain and the summary should not
  // quietly drop.
  if (totals.shipped < 0) lines.push(`- ${Math.abs(totals.shipped)} stories left the shipped count`);
  if (count("released") > 0) lines.push(`- ${count("released")} features signed off by product`);
  if (count("sent_for_sign_off") > 0) lines.push(`- ${count("sent_for_sign_off")} features sent to product`);
  if (count("newly_done_unverified") > 0) {
    lines.push(`- ${count("newly_done_unverified")} stories marked Done with no pull request to prove it`);
  }
  if (count("regressed") + count("feature_regressed") > 0) {
    lines.push(`- ${count("regressed") + count("feature_regressed")} moved backwards`);
  }
  if (lines[lines.length - 1] === "**Moved**") lines.push("- Nothing shipped this week.");
  lines.push("");

  if (totals.stories !== 0 || totals.features !== 0) {
    lines.push("**Scope**");
    const parts: string[] = [];
    if (totals.stories !== 0) parts.push(`${totals.stories > 0 ? "+" : ""}${totals.stories} stories`);
    if (totals.features !== 0) parts.push(`${totals.features > 0 ? "+" : ""}${totals.features} features`);
    lines.push(`- ${parts.join(", ")} since ${totals.from}`);
    lines.push("");
  }

  if (stuck.length > 0) {
    lines.push("**Untouched all week**");
    for (const feature of stuck.slice(0, 8)) {
      lines.push(`- ${feature.code} (${feature.owner}) — ${feature.daysSinceLastActivity} days`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
