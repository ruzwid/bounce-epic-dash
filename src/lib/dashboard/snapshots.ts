// src/lib/dashboard/snapshots.ts
// Build-time snapshot loader. Uses import.meta.glob (a Vite build-time
// import) rather than fs — this must work both during static prerendering
// (Node) and, for client-side navigation between prerendered pages, in the
// browser after hydration. A raw `fs.readFileSync` would work for the
// former only; import.meta.glob's dynamic import() works for both.
import { StatusSnapshot } from "../schema.ts";
import type { ScopeSnapshot } from "./scope.ts";

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

/** How much history the scope timeline reads. A quarter of daily
 *  snapshots is more scope history than anyone reviews at once, and the
 *  cap is what stops this page's payload growing every single day. */
const SCOPE_WINDOW = 90;

/**
 * The recent history, trimmed to the fields a scope diff reads.
 *
 * This is the only loader that pulls many snapshots into one page, and a
 * route loader's result is serialised into that page's prerendered HTML.
 * Handing it whole snapshots produced 624KB of HTML for four days of
 * history — nearly all of it pull requests, acceptance criteria and judge
 * rationale that a scope diff never touches — and it grew with every
 * collection. Projecting here keeps the page's weight flat in everything
 * except the number of tickets.
 */
export async function loadScopeHistory(upTo?: string): Promise<ScopeSnapshot[]> {
  const dates = listSnapshotDates()
    .filter((d) => (upTo ? d <= upTo : true))
    .slice(-SCOPE_WINDOW);
  const loaded = await Promise.all(dates.map((d) => loadSnapshot(d)));
  return loaded
    .filter((s): s is StatusSnapshot => s !== null)
    .map((snapshot) => ({
      date: snapshot.date,
      features: snapshot.features.map((feature) => ({
        key: feature.key,
        code: feature.code,
        title: feature.title,
        owner: feature.owner,
        stage: feature.stage,
        scoreBasis: feature.scoreBasis,
        stories: feature.stories.map((story) => ({
          key: story.key,
          summary: story.summary,
          status: story.status,
        })),
      })),
    }));
}

/** The snapshot nearest to `days` before `date`, for week-over-week
 *  comparisons. Returns the oldest available when the history is shorter
 *  than the window, and null when `date` is the only snapshot — the
 *  caller renders "not enough history" rather than comparing a snapshot
 *  against itself. */
export async function loadSnapshotDaysBefore(date: string, days: number): Promise<StatusSnapshot | null> {
  const dates = listSnapshotDates().filter((d) => d < date);
  if (dates.length === 0) return null;
  const cutoff = new Date(new Date(date).getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // The newest snapshot at or before the cutoff, else the oldest there is.
  const target = [...dates].reverse().find((d) => d <= cutoff) ?? dates[0]!;
  return loadSnapshot(target);
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
