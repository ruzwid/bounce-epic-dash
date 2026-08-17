import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeMilestones, milestoneProgress, signedOffUnverifiedStories } from "../../src/lib/dashboard/nav.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

/** The epic these fixtures belong to. loadSnapshot() stamps this on every
 *  snapshot it returns (the directory a snapshot lives in is what says
 *  which epic it is), and the derivations under test read it to find that
 *  epic's people map and score weights — so a hand-built snapshot has to
 *  carry it too. */
const EPIC = "wpp-at-scale";


const FIXTURES = new URL("./fixtures/snapshots/", import.meta.url);

function loadFixture(name: string) {
  const parsed = StatusSnapshot.parse(JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")));
  // Mirrors loadSnapshot(): the epic a snapshot belongs to comes from the
  // directory it was loaded from, not from the file, and the derivations
  // under test read it to find that epic's score weights and people map.
  return { ...parsed, epic: { ...parsed.epic, slug: EPIC } };
}

describe("signedOffUnverifiedStories", () => {
  it("returns [] when no feature is stage done", () => {
    // 2026-08-10.json has no "done"-stage features and no done_unverified
    // stories at all, so this alone doesn't prove the stage gate works —
    // see the next case, which pairs a "done" feature with all-shipped
    // stories to isolate that half of the filter.
    const snapshot = loadFixture("2026-08-10.json");
    expect(signedOffUnverifiedStories(snapshot)).toEqual([]);
  });

  it("returns [] for a stage-done feature whose stories are all shipped (no done_unverified to surface)", () => {
    // Isolates the status gate: a feature genuinely done the ordinary way
    // (stage "done", nothing done_unverified) must not appear here, even
    // though it clears the stage filter this selector applies.
    const base = loadFixture("2026-08-11.json");
    const snapshot = {
      ...base,
      features: [
        {
          ...base.features[0]!,
          stage: "done" as const,
          stories: [{ ...base.features[0]!.stories[0]!, key: "SHIPPED-1", status: "shipped" as const }],
        },
      ],
    };
    expect(signedOffUnverifiedStories(snapshot)).toEqual([]);
  });

  it("collects done_unverified stories only from features whose stage is done", () => {
    // Build a minimal snapshot in-memory: one feature stage "done" with a
    // done_unverified story (should be included), one feature stage
    // "nearly_done" with a done_unverified story (should NOT be included,
    // since only sign-off can produce "done" alongside done_unverified —
    // this fixture directly tests the filter, independent of how stage
    // was derived).
    const base = loadFixture("2026-08-11.json");
    const snapshot = {
      ...base,
      features: [
        {
          ...base.features[0]!,
          stage: "done" as const,
          stories: [
            { ...base.features[0]!.stories[0]!, key: "SIGNED-1", status: "done_unverified" as const },
          ],
        },
        {
          ...base.features[1]!,
          stage: "nearly_done" as const,
          stories: [
            { ...base.features[1]!.stories[0]!, key: "UNSIGNED-1", status: "done_unverified" as const },
          ],
        },
      ],
    };
    const result = signedOffUnverifiedStories(snapshot);
    expect(result).toHaveLength(1);
    expect(result[0]?.story.key).toBe("SIGNED-1");
    expect(result[0]?.feature.key).toBe(base.features[0]!.key);
  });
});

describe("milestoneProgress", () => {
  it("reports the milestone itself as 'done' when its lone feature is signed-off done at a score below 100", () => {
    // Regression: a milestone/epic's own stage is only ever "done" when
    // deriveStage's signedOff override fires for the aggregate too, not
    // just for the individual feature. Before this fix, passing `allDone`
    // only as the 2nd arg (allStoriesShippedToDefault) did nothing when the
    // milestone's weighted score was below 100 — a real possibility once
    // sign-off is allowed to apply to a feature with genuine todo/blocked
    // stories dragging its own score down.
    const base = loadFixture("2026-08-11.json");
    const feature = {
      ...base.features[0]!,
      stage: "done" as const,
      // shipped:1, todo:1 -> weighted score 50, well under 100.
      scoreBasis: { shipped: 1, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 1, total: 2 },
    };
    const progress = milestoneProgress("wpp-at-scale", [feature]);
    expect(progress.score).toBeLessThan(100);
    expect(progress.stage).toBe("done");
  });
});

describe("activeMilestones", () => {
  it("excludes a milestone only once every one of its features is stage 'done'", () => {
    const base = loadFixture("2026-08-11.json");
    const [f1, f2] = base.features;
    const snapshot = {
      ...base,
      features: [
        { ...f1!, milestone: "M1" as const, stage: "done" as const },
        { ...f2!, milestone: "M2" as const, stage: "underway" as const },
      ],
    };
    expect(activeMilestones(snapshot)).toEqual(new Set(["M2"]));
  });

  it("keeps a milestone active while any one of its features isn't done yet", () => {
    const base = loadFixture("2026-08-11.json");
    const [f1, f2] = base.features;
    const snapshot = {
      ...base,
      features: [
        { ...f1!, milestone: "M1" as const, stage: "done" as const },
        { ...f2!, milestone: "M1" as const, stage: "underway" as const },
      ],
    };
    expect(activeMilestones(snapshot)).toEqual(new Set(["M1"]));
  });
});
