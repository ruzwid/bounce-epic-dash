// src/lib/dashboard/slack.ts
// Builds the "Copy Slack summary" button's text — Slack mrkdwn, built from
// the same StatusSnapshot the page renders. Slack mrkdwn is NOT markdown:
// *bold* (single asterisk), no tables, no ATX headings — Slack renders
// "# heading" and "**bold**" as literal text, and pipe tables not at all.
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import { needsAttention } from "./search.ts";
import { storyTotals } from "./totals.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

export function buildSlackSummary(snapshot: StatusSnapshotT): string {
  const lines: string[] = [];

  lines.push(`*${snapshot.epic.title}* — ${snapshot.date}`);
  lines.push(`*${snapshot.headline.sentence}*`);
  lines.push("");

  // Summed from the features rather than read off snapshot.kpis — the
  // same reason the KPI strip does (src/lib/dashboard/totals.ts): these
  // seven add up to the total, where the published KPI object omitted
  // in-progress entirely and fused blocked with to-do.
  const totals = storyTotals(snapshot.features);
  lines.push("*KPIs*");
  lines.push(`• Features tracked: ${snapshot.features.length} (+${snapshot.kpis.lightTierMilestones} light-tier)`);
  lines.push(`• Stories tracked: ${totals.total}`);
  lines.push(`• Shipped to master: ${totals.shipped}`);
  lines.push(`• Done, unverified: ${totals.doneUnverified}`);
  lines.push(`• Staged, not shipped: ${totals.staged}`);
  lines.push(`• In review: ${totals.inReview}`);
  lines.push(`• In progress: ${totals.inProgress}`);
  lines.push(`• To do: ${totals.todo}`);
  if (totals.blocked > 0) lines.push(`• Blocked: ${totals.blocked}`);
  lines.push("");

  lines.push("*Features*");
  const now = new Date(snapshot.generatedAt);
  for (const feature of snapshot.features) {
    const flag = needsAttention(feature, now) ? " — needs attention" : "";
    // stage "done" at a score below 100 is only reachable via product
    // sign-off (see deriveStage in src/lib/score.ts) — called out here so
    // "done, 40%" doesn't read as a self-contradiction with zero context.
    const signedOffNote = feature.stage === "done" && feature.score !== 100 ? " (signed off)" : "";
    lines.push(
      `• ${feature.code} (${feature.owner}): ${feature.stage.replace("_", " ")}, ${feature.score}%${signedOffNote}${flag}`,
    );
  }

  if (snapshot.collectionErrors.length > 0) {
    lines.push("");
    lines.push(`*Collection errors:* ${snapshot.collectionErrors.length} — see the full dashboard.`);
  }

  return lines.join("\n");
}
