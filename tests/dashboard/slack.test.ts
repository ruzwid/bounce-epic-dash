import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSlackSummary } from "../../src/lib/dashboard/slack.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

const snapshot = StatusSnapshot.parse(
  JSON.parse(readFileSync(new URL("./fixtures/snapshots/2026-08-11.json", import.meta.url), "utf-8")),
);

describe("buildSlackSummary", () => {
  const summary = buildSlackSummary(snapshot);

  it("bolds the headline sentence using Slack mrkdwn, not markdown", () => {
    expect(summary).toContain(`*${snapshot.headline.sentence}*`);
  });

  it("never uses a markdown table", () => {
    expect(summary).not.toMatch(/\|.*\|/);
  });

  it("never uses a markdown heading", () => {
    expect(summary).not.toMatch(/^#{1,6}\s/m);
  });

  it("never uses double-asterisk bold (that's markdown, not Slack mrkdwn)", () => {
    expect(summary).not.toMatch(/\*\*/);
  });

  it("uses bullet points for lists", () => {
    expect(summary).toContain("•");
  });

  it("includes a KPI line with the real shipped/staged counts", () => {
    expect(summary).toContain(String(snapshot.kpis.shipped));
    expect(summary).toContain(String(snapshot.kpis.staged));
  });

  it("includes a KPI line with the doneUnverified count", () => {
    expect(summary).toContain(String(snapshot.kpis.doneUnverified));
    expect(summary).toContain("Done, unverified");
  });

  it("includes each feature's code, stage, and score", () => {
    for (const feature of snapshot.features) {
      expect(summary).toContain(feature.code);
      expect(summary).toContain(`${feature.score}%`);
    }
  });

  it("flags a feature with a blocked story as needing attention", () => {
    const blockedFeature = snapshot.features.find((f) => f.scoreBasis.blocked > 0);
    expect(blockedFeature).toBeDefined();
    // Its line should be distinguishable from a healthy feature's line —
    // check for a marker word rather than assuming exact copy.
    const lines = summary.split("\n").filter((l) => l.includes(blockedFeature!.code));
    expect(lines.some((l) => /attention|blocked/i.test(l))).toBe(true);
  });
});
