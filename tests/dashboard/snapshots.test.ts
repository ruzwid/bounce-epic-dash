import { describe, expect, it } from "vitest";
import {
  listSnapshotDates,
  loadHistory,
  loadLatestSnapshot,
  loadPreviousSnapshot,
  loadSnapshot,
} from "../../src/lib/dashboard/snapshots.ts";

// Against the real data/snapshots/ directory — that's the whole point of
// import.meta.glob, and there's a real committed snapshot to check against.

describe("listSnapshotDates", () => {
  it("returns real snapshot dates, sorted ascending, including 2026-08-11", () => {
    const dates = listSnapshotDates();
    expect(dates).toContain("2026-08-11");
    expect(dates).toEqual([...dates].sort());
  });
});

describe("loadSnapshot", () => {
  it("loads and schema-validates a real snapshot by date", async () => {
    const snapshot = await loadSnapshot("2026-08-11");
    expect(snapshot?.date).toBe("2026-08-11");
    expect(snapshot?.features.length).toBeGreaterThan(0);
  });

  it("returns null for a date with no snapshot", async () => {
    const snapshot = await loadSnapshot("1999-01-01");
    expect(snapshot).toBeNull();
  });
});

describe("loadLatestSnapshot", () => {
  it("loads the most recent snapshot", async () => {
    const snapshot = await loadLatestSnapshot();
    const dates = listSnapshotDates();
    expect(snapshot.date).toBe(dates[dates.length - 1]);
  });
});

describe("loadPreviousSnapshot", () => {
  it("returns null for the earliest available date", async () => {
    const dates = listSnapshotDates();
    const previous = await loadPreviousSnapshot(dates[0]!);
    expect(previous).toBeNull();
  });

  it("returns null for a date that doesn't exist", async () => {
    expect(await loadPreviousSnapshot("1999-01-01")).toBeNull();
  });
});

describe("loadHistory", () => {
  it("returns one point per snapshot, ascending, each with kpis", async () => {
    const history = await loadHistory();
    const dates = listSnapshotDates();
    expect(history.map((h) => h.date)).toEqual(dates);
    for (const point of history) {
      expect(point.kpis).toBeDefined();
      expect(point.generatedAt).toBeTruthy();
    }
  });
});
