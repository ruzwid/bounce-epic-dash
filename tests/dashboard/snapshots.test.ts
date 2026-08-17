import { describe, expect, it } from "vitest";
import {
  listSnapshotDates,
  listSnapshotEpics,
  loadHistory,
  loadLatestSnapshot,
  loadPreviousSnapshot,
  loadSnapshot,
} from "../../src/lib/dashboard/snapshots.ts";

// Against the real data/snapshots/ directory — that's the whole point of
// import.meta.glob, and there's a real committed snapshot to check against.
// Snapshots are stored per epic (data/snapshots/<slug>/<date>.json), so
// every call here names the epic it's reading.
const EPIC = "wpp-at-scale";

describe("listSnapshotEpics", () => {
  it("lists the epics that actually have snapshots on disk", () => {
    expect(listSnapshotEpics()).toContain(EPIC);
  });
});

describe("listSnapshotDates", () => {
  it("returns real snapshot dates for one epic, sorted ascending, including 2026-08-11", () => {
    const dates = listSnapshotDates(EPIC);
    expect(dates).toContain("2026-08-11");
    expect(dates).toEqual([...dates].sort());
  });

  it("returns nothing for an epic with no snapshots", () => {
    expect(listSnapshotDates("no-such-epic")).toEqual([]);
  });
});

describe("loadSnapshot", () => {
  it("loads and schema-validates a real snapshot by epic and date", async () => {
    const snapshot = await loadSnapshot(EPIC, "2026-08-11");
    expect(snapshot?.date).toBe("2026-08-11");
    expect(snapshot?.features.length).toBeGreaterThan(0);
  });

  it("stamps the epic it was loaded from, even on a snapshot written before slugs existed", async () => {
    // 2026-08-11 is schemaVersion 1, whose file carries no slug at all —
    // the directory is what makes it attributable, and every derivation
    // downstream reads snapshot.epic.slug rather than being handed one.
    const snapshot = await loadSnapshot(EPIC, "2026-08-11");
    expect(snapshot?.epic.slug).toBe(EPIC);
  });

  it("returns null for a date with no snapshot", async () => {
    expect(await loadSnapshot(EPIC, "1999-01-01")).toBeNull();
  });

  it("returns null for a real date under an epic that doesn't have it", async () => {
    expect(await loadSnapshot("no-such-epic", "2026-08-11")).toBeNull();
  });
});

describe("loadLatestSnapshot", () => {
  it("loads the most recent snapshot for the epic", async () => {
    const snapshot = await loadLatestSnapshot(EPIC);
    const dates = listSnapshotDates(EPIC);
    expect(snapshot?.date).toBe(dates[dates.length - 1]);
  });

  it("returns null for an epic with no snapshots — a configured epic that hasn't been collected yet is a real state, not an error", async () => {
    expect(await loadLatestSnapshot("no-such-epic")).toBeNull();
  });
});

describe("loadPreviousSnapshot", () => {
  it("returns null for the earliest available date", async () => {
    const dates = listSnapshotDates(EPIC);
    const previous = await loadPreviousSnapshot(EPIC, dates[0]!);
    expect(previous).toBeNull();
  });

  it("returns null for a date that doesn't exist", async () => {
    expect(await loadPreviousSnapshot(EPIC, "1999-01-01")).toBeNull();
  });
});

describe("loadHistory", () => {
  it("returns one point per snapshot of that epic, ascending, each with kpis", async () => {
    const history = await loadHistory(EPIC);
    const dates = listSnapshotDates(EPIC);
    expect(history.map((h) => h.date)).toEqual(dates);
    for (const point of history) {
      expect(point.kpis).toBeDefined();
      expect(point.generatedAt).toBeTruthy();
    }
  });
});
