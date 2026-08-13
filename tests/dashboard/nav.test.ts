import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signedOffUnverifiedStories } from "../../src/lib/dashboard/nav.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

const FIXTURES = new URL("./fixtures/snapshots/", import.meta.url);

function loadFixture(name: string) {
  return StatusSnapshot.parse(JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")));
}

describe("signedOffUnverifiedStories", () => {
  it("returns [] when no feature is stage done_unverified-and-done", () => {
    const snapshot = loadFixture("2026-08-10.json");
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
