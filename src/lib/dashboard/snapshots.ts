// src/lib/dashboard/snapshots.ts
// Build-time snapshot loader. Uses import.meta.glob (a Vite build-time
// import) rather than fs — this must work both during static prerendering
// (Node) and, for client-side navigation between prerendered pages, in the
// browser after hydration. A raw `fs.readFileSync` would work for the
// former only; import.meta.glob's dynamic import() works for both.
import { StatusSnapshot } from "../schema.ts";

// Lazy (non-eager): each snapshot becomes its own code-split chunk,
// fetched on demand — a growing history of snapshots never bloats a
// shared bundle just because one page needs "the latest" or "one date".
const snapshotModules = import.meta.glob<{ default: unknown }>("../../../data/snapshots/*.json");

function dateFromPath(path: string): string | null {
  return path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null;
}

/** Every snapshot date available, ascending. */
export function listSnapshotDates(): string[] {
  return Object.keys(snapshotModules)
    .map(dateFromPath)
    .filter((d): d is string => d !== null)
    .sort();
}

function keyForDate(date: string): string | undefined {
  return Object.keys(snapshotModules).find((path) => dateFromPath(path) === date);
}

/** The validated snapshot for one date, or null if it doesn't exist. */
export async function loadSnapshot(date: string): Promise<StatusSnapshot | null> {
  const key = keyForDate(date);
  if (!key) return null;
  const mod = await snapshotModules[key]!();
  return StatusSnapshot.parse(mod.default);
}

/** The most recent snapshot. Throws if none exist — a site with zero
 *  snapshots has nothing to render, which is a real setup error, not a
 *  state the UI should render around. */
export async function loadLatestSnapshot(): Promise<StatusSnapshot> {
  const dates = listSnapshotDates();
  const latest = dates[dates.length - 1];
  if (!latest) {
    throw new Error("No snapshots found in data/snapshots/ — run the collection pipeline first.");
  }
  const snapshot = await loadSnapshot(latest);
  if (!snapshot) {
    throw new Error(`Snapshot for ${latest} listed but failed to load.`);
  }
  return snapshot;
}

/** The snapshot immediately before `date` in the available history, or
 *  null if `date` is the first one (or isn't found at all). Used to
 *  compute since-last-snapshot deltas — never fabricated when there's no
 *  real prior snapshot. */
export async function loadPreviousSnapshot(date: string): Promise<StatusSnapshot | null> {
  const dates = listSnapshotDates();
  const index = dates.indexOf(date);
  if (index <= 0) return null;
  return loadSnapshot(dates[index - 1]!);
}

export type HistoryPoint = {
  date: string;
  generatedAt: string;
  kpis: StatusSnapshot["kpis"];
};

/** date + kpis + generatedAt for every snapshot, ascending — the burn-up
 *  chart's full history. Deliberately excludes `features` (no need to ship
 *  every historical feature list just to draw
 *  shipped/doneUnverified/staged-over-time). */
export async function loadHistory(): Promise<HistoryPoint[]> {
  const dates = listSnapshotDates();
  const points = await Promise.all(
    dates.map(async (date) => {
      const snapshot = await loadSnapshot(date);
      if (!snapshot) return null;
      return { date: snapshot.date, generatedAt: snapshot.generatedAt, kpis: snapshot.kpis };
    }),
  );
  return points.filter((p): p is HistoryPoint => p !== null);
}
