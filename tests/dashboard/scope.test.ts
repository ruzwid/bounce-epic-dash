import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../../src/lib/schema.ts";
import { growthByFeature, scopeTimeline } from "../../src/lib/dashboard/scope.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

function feature(key: string, code: string, storyKeys: string[]) {
  return {
    key,
    code,
    title: `${code} — A feature`,
    owner: "Alice",
    stage: "underway",
    stories: storyKeys.map((k) => ({ key: k, summary: `${k} summary`, status: "todo" })),
    scoreBasis: {
      shipped: 0,
      doneUnverified: 0,
      staged: 0,
      inReview: 0,
      inProgress: 0,
      blocked: 0,
      todo: storyKeys.length,
      total: storyKeys.length,
    },
  };
}

function snapshot(date: string, features: ReturnType<typeof feature>[]): StatusSnapshotT {
  return { date, features } as unknown as StatusSnapshotT;
}

describe("scopeTimeline", () => {
  const day1 = snapshot("2026-08-10", [feature("F-1", "F1.1", ["S-1", "S-2"])]);
  const day2 = snapshot("2026-08-11", [
    feature("F-1", "F1.1", ["S-1", "S-2", "S-3"]),
    feature("F-2", "F1.2", ["S-4"]),
  ]);

  it("needs two snapshots before it can report a change", () => {
    expect(scopeTimeline([day1])).toBeNull();
    expect(scopeTimeline([])).toBeNull();
  });

  it("separates a whole new feature from a feature that grew", () => {
    const timeline = scopeTimeline([day1, day2])!;
    const step = timeline.steps[0]!;

    const grew = step.added.find((a) => a.feature.key === "F-1")!;
    const joined = step.added.find((a) => a.feature.key === "F-2")!;

    expect(grew.isNewFeature).toBe(false);
    expect(grew.stories.map((s) => s.key)).toEqual(["S-3"]);
    expect(joined.isNewFeature).toBe(true);
    expect(joined.stories).toHaveLength(1);
  });

  it("totals the window, not just the last step", () => {
    const timeline = scopeTimeline([day1, day2])!;
    expect(timeline.first).toEqual({ date: "2026-08-10", stories: 2, features: 1 });
    expect(timeline.latest).toEqual({ date: "2026-08-11", stories: 4, features: 2 });
    expect(timeline.netStories).toBe(2);
    expect(timeline.netFeatures).toBe(1);
  });

  it("reports work that left the epic — the way a percentage improves without anything finishing", () => {
    const shrunk = snapshot("2026-08-12", [feature("F-1", "F1.1", ["S-1"])]);
    const step = scopeTimeline([day2, shrunk])!.steps[0]!;

    expect(step.removedFeatures.map((f) => f.key)).toEqual(["F-2"]);
    expect(step.removedStories[0]!.stories.map((s) => s.key)).toEqual(["S-2", "S-3"]);
    expect(step.storiesDelta).toBe(-3);
  });

  it("lists steps newest first", () => {
    const day3 = snapshot("2026-08-12", [feature("F-1", "F1.1", ["S-1", "S-2", "S-3"]), feature("F-2", "F1.2", ["S-4"])]);
    const timeline = scopeTimeline([day1, day2, day3])!;
    expect(timeline.steps.map((s) => s.date)).toEqual(["2026-08-12", "2026-08-11"]);
  });
});

describe("growthByFeature", () => {
  it("adds a feature's growth across every step, biggest first", () => {
    const a = snapshot("2026-08-10", [feature("F-1", "F1.1", ["S-1"])]);
    const b = snapshot("2026-08-11", [feature("F-1", "F1.1", ["S-1", "S-2"])]);
    const c = snapshot("2026-08-12", [
      feature("F-1", "F1.1", ["S-1", "S-2", "S-3"]),
      feature("F-2", "F1.2", ["S-4", "S-5", "S-6", "S-7"]),
    ]);

    const growth = growthByFeature(scopeTimeline([a, b, c])!);
    expect(growth.map((g) => [g.feature.code, g.stories, g.isNew])).toEqual([
      ["F1.2", 4, true],
      ["F1.1", 2, false],
    ]);
  });
});
