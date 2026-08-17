import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeChanges, formatSinceLabel, groupChanges, groupChangesByOwner } from "../../src/lib/dashboard/diff.ts";
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

  it("still surfaces 'shipped' for a feature that is already stage done, but suppresses its 'newly_stalled'", () => {
    // BOUN-100 is the feature behind both the "shipped" (SUB-1) and
    // "newly_stalled" cases above. A feature already stage "done" (e.g.
    // signed off) shouldn't keep generating stall noise, but a story
    // actually shipping is still real, worth-knowing news regardless —
    // it's the one change kind that's never suppressed by this rule.
    const doneCurrent = {
      ...current,
      features: current.features.map((f) => (f.key === "BOUN-100" ? { ...f, stage: "done" as const } : f)),
    };
    const changes = computeChanges(doneCurrent, previous);
    const shipped = changes.filter((c) => c.kind === "shipped").filter((c) => c.feature.key === "BOUN-100");
    expect(shipped).toHaveLength(1);
    expect(shipped[0]!.story.key).toBe("SUB-1");
    expect(changes.some((c) => c.kind === "newly_stalled" && c.feature.key === "BOUN-100")).toBe(false);
  });

  it("suppresses 'newly_done_unverified' and 'newly_blocked' for a feature that is already stage done", () => {
    const doneCurrent = {
      ...current,
      features: current.features.map((f) =>
        f.key === "BOUN-300" || f.key === "BOUN-200" ? { ...f, stage: "done" as const } : f,
      ),
    };
    const changes = computeChanges(doneCurrent, previous);
    expect(changes.some((c) => c.kind === "newly_done_unverified" && c.feature.key === "BOUN-300")).toBe(false);
    expect(changes.some((c) => c.kind === "newly_blocked" && c.feature.key === "BOUN-200")).toBe(false);
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

/** The fixtures are schemaVersion 1, which predates published sign-off.
 *  Bumping both sides is what tells computeChanges the two snapshots are
 *  actually comparable on that field. */
function withSignOffData(snapshot: ReturnType<typeof loadFixture>) {
  return { ...snapshot, schemaVersion: 3 as const };
}

describe("computeChanges — regressions", () => {
  it("reports a story falling from shipped to done_unverified as a regression, not as newly done", () => {
    // The real-world case: the epic's shipped count dropped by two while
    // the page cheerfully reported "+4 pts".
    const wasShipped = {
      ...previous,
      features: previous.features.map((f) =>
        f.key === "BOUN-100"
          ? { ...f, stories: f.stories.map((s) => (s.key === "SUB-1" ? { ...s, status: "shipped" as const } : s)) }
          : f,
      ),
    };
    const nowUnverified = {
      ...current,
      features: current.features.map((f) =>
        f.key === "BOUN-100"
          ? {
              ...f,
              stage: "underway" as const,
              stories: f.stories.map((s) => (s.key === "SUB-1" ? { ...s, status: "done_unverified" as const } : s)),
            }
          : f,
      ),
    };
    const changes = computeChanges(nowUnverified, wasShipped);
    const regressed = changes.filter((c) => c.kind === "regressed");
    expect(regressed).toHaveLength(1);
    expect(regressed[0]).toMatchObject({ from: "shipped", to: "done_unverified" });
    expect(changes.some((c) => c.kind === "newly_done_unverified" && c.feature.key === "BOUN-100")).toBe(false);
  });

  it("reports a feature whose stage slipped, with the score it lost", () => {
    // F1.2 really does slip between these two fixtures — early -> not
    // started, 15 points gone — and the old flat feed said nothing at all.
    const featureRegressed = computeChanges(current, previous).filter((c) => c.kind === "feature_regressed");
    expect(featureRegressed).toHaveLength(1);
    expect(featureRegressed[0]).toMatchObject({
      from: "early",
      to: "not_started",
      scoreDelta: -15,
    });
    expect(featureRegressed[0]!.feature.key).toBe("BOUN-200");
  });

  it("does not report a feature that advanced", () => {
    const advanced = {
      ...current,
      features: current.features.map((f) => (f.key === "BOUN-200" ? { ...f, stage: "underway" as const } : f)),
    };
    expect(computeChanges(advanced, previous).some((c) => c.kind === "feature_regressed")).toBe(false);
  });
});

describe("computeChanges — sign-off", () => {
  it("reports a feature product approved overnight", () => {
    const approved = {
      ...withSignOffData(current),
      features: current.features.map((f) =>
        f.key === "BOUN-300" ? { ...f, signedOff: true, stage: "done" as const } : f,
      ),
    };
    const changes = computeChanges(approved, withSignOffData(previous));
    const released = changes.filter((c) => c.kind === "released");
    expect(released).toHaveLength(1);
    expect(released[0]!.feature.key).toBe("BOUN-300");
  });

  it("reports a feature sent into Product Review", () => {
    const sent = {
      ...withSignOffData(current),
      features: current.features.map((f) => (f.key === "BOUN-100" ? { ...f, awaitingSignOff: true } : f)),
    };
    const changes = computeChanges(sent, withSignOffData(previous));
    expect(changes.filter((c) => c.kind === "sent_for_sign_off")).toHaveLength(1);
  });

  it("stays silent about sign-off when the previous snapshot predates the field", () => {
    // Otherwise the first snapshot after the field ships announces every
    // long-approved feature as approved overnight.
    const approved = {
      ...withSignOffData(current),
      features: current.features.map((f) => ({ ...f, signedOff: true })),
    };
    expect(computeChanges(approved, previous).some((c) => c.kind === "released")).toBe(false);
  });

  it("keeps reporting a release even though sign-off forces the feature to 'done'", () => {
    // The settled-feature filter must not swallow the very transition
    // that settled it.
    const approved = {
      ...withSignOffData(current),
      features: current.features.map((f) => ({ ...f, signedOff: true, stage: "done" as const })),
    };
    const changes = computeChanges(approved, withSignOffData(previous));
    expect(changes.filter((c) => c.kind === "released")).toHaveLength(3);
  });
});

describe("computeChanges — scope", () => {
  it("reports a feature that joined the epic, and does not diff its stories as movement", () => {
    const shrunk = { ...previous, features: previous.features.filter((f) => f.key !== "BOUN-300") };
    const changes = computeChanges(current, shrunk);
    const added = changes.filter((c) => c.kind === "scope_added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ isNewFeature: true });
    expect(added[0]!.kind === "scope_added" && added[0]!.stories).toHaveLength(1);
    expect(changes.some((c) => c.feature.key === "BOUN-300" && c.kind === "newly_done_unverified")).toBe(false);
  });

  it("reports stories added to an existing feature", () => {
    const grown = {
      ...current,
      features: current.features.map((f) =>
        f.key === "BOUN-100" ? { ...f, stories: [...f.stories, { ...f.stories[0]!, key: "SUB-99" }] } : f,
      ),
    };
    const changes = computeChanges(grown, previous);
    const added = changes.filter((c) => c.kind === "scope_added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ isNewFeature: false });
    // The stories themselves, not a count — the row names what arrived.
    expect(added[0]!.kind === "scope_added" && added[0]!.stories.map((s) => s.key)).toEqual(["SUB-99"]);
  });
});

describe("groupChanges", () => {
  it("drops empty sections and keeps the rest in reading order", () => {
    const sections = groupChanges(computeChanges(current, previous));
    expect(sections.map((s) => s.id)).toEqual([
      "shipped",
      "newly_done_unverified",
      "feature_regressed",
      "newly_blocked",
      "newly_stalled",
    ]);
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it("says the done-unverified explanation once, as a section note", () => {
    const sections = groupChanges(computeChanges(current, previous));
    const section = sections.find((s) => s.id === "newly_done_unverified")!;
    expect(section.note).toMatch(/no pull request proves/i);
    expect(section.items).toHaveLength(1);
  });

  it("returns nothing at all for an empty change set", () => {
    expect(groupChanges([])).toEqual([]);
  });
});

describe("groupChangesByOwner", () => {
  it("buckets by feature owner, busiest first", () => {
    const groups = groupChangesByOwner(computeChanges(current, previous));
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]!.items.length).toBeGreaterThanOrEqual(groups[groups.length - 1]!.items.length);
    expect(groups.flatMap((g) => g.items)).toHaveLength(computeChanges(current, previous).length);
  });
});
