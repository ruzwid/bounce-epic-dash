import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeChanges, formatSinceLabel } from "../../src/lib/dashboard/diff.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

const FIXTURES = new URL("./fixtures/snapshots/", import.meta.url);

function loadFixture(name: string) {
  return StatusSnapshot.parse(JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")));
}

const previous = loadFixture("2026-08-10.json");
const current = loadFixture("2026-08-11.json");

describe("computeChanges", () => {
  it("returns [] when there is no previous snapshot — never fabricates a delta", () => {
    expect(computeChanges(current, null)).toEqual([]);
  });

  it("produces exactly one 'shipped' item for the story that flipped staged->shipped, with the right scoreDelta", () => {
    const changes = computeChanges(current, previous);
    const shipped = changes.filter((c) => c.kind === "shipped");
    expect(shipped).toHaveLength(1);
    expect(shipped[0]).toMatchObject({ kind: "shipped", scoreDelta: 25 });
    expect(shipped[0]!.story.key).toBe("SUB-1");
  });

  it("produces a 'newly_blocked' item for the story that flipped to blocked", () => {
    const changes = computeChanges(current, previous);
    const blocked = changes.filter((c) => c.kind === "newly_blocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.story.key).toBe("SUB-3");
  });

  it("produces a 'newly_stalled' item only for the feature crossing the 14-day threshold", () => {
    const changes = computeChanges(current, previous);
    const stalled = changes.filter((c) => c.kind === "newly_stalled");
    expect(stalled).toHaveLength(1);
    expect(stalled[0]).toMatchObject({ daysSinceLastActivity: 15 });
    expect(stalled[0]!.feature.key).toBe("BOUN-100");
  });

  it("does not re-fire 'newly_stalled' for a feature that was already stalled before", () => {
    // BOUN-200's activity didn't change (still 5 days) — never stalled.
    const changes = computeChanges(current, previous);
    expect(changes.some((c) => c.kind === "newly_stalled" && c.feature.key === "BOUN-200")).toBe(false);
  });

  it("produces no 'newly_staged' item here (nothing newly flipped to staged in the fixtures)", () => {
    const changes = computeChanges(current, previous);
    expect(changes.filter((c) => c.kind === "newly_staged")).toHaveLength(0);
  });

  it("produces a 'newly_done_unverified' item for the story that flipped from todo to done_unverified", () => {
    const changes = computeChanges(current, previous);
    const doneUnverified = changes.filter((c) => c.kind === "newly_done_unverified");
    expect(doneUnverified).toHaveLength(1);
    expect(doneUnverified[0]!.story.key).toBe("SUB-4");
  });
});

describe("formatSinceLabel", () => {
  it("names a one-day gap 'since yesterday'", () => {
    expect(formatSinceLabel("2026-08-10", "2026-08-11")).toBe("since yesterday");
  });

  it("names a short gap by weekday", () => {
    // 2026-08-07 is a Friday.
    expect(formatSinceLabel("2026-08-07", "2026-08-11")).toBe("since Friday");
  });

  it("falls back to the date for a long gap", () => {
    expect(formatSinceLabel("2026-07-01", "2026-08-11")).toBe("since 2026-07-01");
  });
});
