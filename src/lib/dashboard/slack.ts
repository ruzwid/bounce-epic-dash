// src/lib/dashboard/slack.ts
// Builds the "Copy Slack summary" button's text — Slack mrkdwn, built from
// the same StatusSnapshot the page renders. Slack mrkdwn is NOT markdown:
// *bold* (single asterisk), no tables, no ATX headings — Slack renders
// "# heading" and "**bold**" as literal text, and pipe tables not at all.
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import { needsAttention } from "./search.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

export function buildSlackSummary(snapshot: StatusSnapshotT): string {
  const lines: string[] = [];

  lines.push(`*${snapshot.epic.title}* — ${snapshot.date}`);
  lines.push(`*${snapshot.headline.sentence}*`);
  lines.push("");

  lines.push("*KPIs*");
  lines.push(`• Features tracked: ${snapshot.kpis.featuresTracked} (+${snapshot.kpis.lightTierMilestones} light-tier)`);
  lines.push(`• Subtasks tracked: ${snapshot.kpis.subtasksTracked}`);
  lines.push(`• Shipped to master: ${snapshot.kpis.shipped}`);
  lines.push(`• Staged, not shipped: ${snapshot.kpis.staged}`);
  lines.push(`• In review: ${snapshot.kpis.inReview}`);
  lines.push(`• Blocked/to do: ${snapshot.kpis.blockedOrTodo}`);
  lines.push("");

  lines.push("*Features*");
  const now = new Date(snapshot.generatedAt);
  for (const feature of snapshot.features) {
    const flag = needsAttention(feature, now) ? " — needs attention" : "";
    lines.push(`• ${feature.code} (${feature.owner}): ${feature.stage.replace("_", " ")}, ${feature.score}%${flag}`);
  }

  if (snapshot.collectionErrors.length > 0) {
    lines.push("");
    lines.push(`*Collection errors:* ${snapshot.collectionErrors.length} — see the full dashboard.`);
  }

  return lines.join("\n");
}
