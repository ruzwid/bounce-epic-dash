// src/lib/dashboard/snapshots.ts
// Build-time snapshot loader. Uses import.meta.glob (a Vite build-time
// import) rather than fs — this must work both during static prerendering
// (Node) and, for client-side navigation between prerendered pages, in the
// browser after hydration. A raw `fs.readFileSync` would work for the
// former only; import.meta.glob's dynamic import() works for both.
import { StatusSnapshot } from "../schema.ts";
import { epicProgress } from "./nav.ts";
import type { ScopeSnapshot } from "./scope.ts";

// Lazy (non-eager): each snapshot becomes its own code-split chunk,
// fetched on demand — a growing history of snapshots never bloats a
// shared bundle just because one page needs "the latest" or "one date".
// Snapshots are stored one directory per epic — data/snapshots/<slug>/ —
// so every loader here takes the slug it's reading. The two-segment glob
// is what makes the epic part of the key rather than something a caller
// has to remember to filter by afterwards.
const snapshotModules = import.meta.glob<{ default: unknown }>("../../../data/snapshots/*/*.json");

function locationFromPath(path: string): { epic: string; date: string } | null {
  const match = path.match(/\/data\/snapshots\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? { epic: match[1]!, date: match[2]! } : null;
}

/** Every epic that has at least one snapshot on disk, ascending. Distinct
 *  from the epics.yaml registry (see appConfig.ts's EPICS): an epic can be
 *  configured but not yet collected, and this is the list of what actually
 *  has data to show. */
export function listSnapshotEpics(): string[] {
  return [
    ...new Set(
      Object.keys(snapshotModules)
        .map(locationFromPath)
        .filter((l): l is { epic: string; date: string } => l !== null)
        .map((l) => l.epic),
    ),
  ].sort();
}

/** Every snapshot date available for one epic, ascending. */
export function listSnapshotDates(epic: string): string[] {
  return Object.keys(snapshotModules)
    .map(locationFromPath)
    .filter((l): l is { epic: string; date: string } => l !== null && l.epic === epic)
    .map((l) => l.date)
    .sort();
}

/** The newest snapshot date one epic has, or null when it has none.
 *  Reads the file listing only — nothing is loaded or parsed, which is the
 *  point: callers that just need to know *which* date is latest (to anchor
 *  a comparison window, say) shouldn't pay for a whole snapshot to read
 *  one field off it. */
export function latestSnapshotDate(epic: string): string | null {
  const dates = listSnapshotDates(epic);
  return dates[dates.length - 1] ?? null;
}

function keyFor(epic: string, date: string): string | undefined {
  return Object.keys(snapshotModules).find((path) => {
    const location = locationFromPath(path);
    return location?.epic === epic && location.date === date;
  });
}

/** The validated snapshot for one epic and date, or null if it doesn't
 *  exist.
 *
 *  The parse here is not a redundant re-check of a file the pipeline
 *  already validated, and removing it on that reasoning breaks the site.
 *  The schema carries ~29 `.default()`s, so parsing is also the migration
 *  step that makes a snapshot written weeks ago readable by today's
 *  components: the oldest one on disk has no `milestones` array and no
 *  `features[].stories` at all, and skipping the parse hands those
 *  straight to a `.map()` as undefined.
 *
 *  It costs zod in the client bundle, which is real. The way out is to
 *  stop shipping snapshots that need migrating — have merge.ts write
 *  parsed output and normalise the existing files once — not to drop the
 *  parse while the files still need it. */
export async function loadSnapshot(epic: string, date: string): Promise<StatusSnapshot | null> {
  const key = keyFor(epic, date);
  if (!key) return null;
  const mod = await snapshotModules[key]!();
  const parsed = StatusSnapshot.parse(mod.default);
  // The directory it was loaded from is the authority on which epic a
  // snapshot belongs to, and is stamped on here so every derivation
  // downstream can read `snapshot.epic.slug` without also being handed the
  // slug separately. Snapshots written before the dashboard tracked more
  // than one epic carry an empty slug in the file itself; this is what
  // makes them indistinguishable from ones that don't.
  return { ...parsed, epic: { ...parsed.epic, slug: epic } };
}

/** One epic's most recent snapshot, or null when it has none yet.
 *
 *  Nullable rather than throwing, unlike the single-epic version this
 *  replaced: a newly-added epic legitimately has no snapshots until its
 *  first collection run, and that is a state the route renders around
 *  rather than a setup error that should take the whole site down. */
export async function loadLatestSnapshot(epic: string): Promise<StatusSnapshot | null> {
  const latest = latestSnapshotDate(epic);
  if (!latest) return null;
  const snapshot = await loadSnapshot(epic, latest);
  if (!snapshot) {
    throw new Error(`Snapshot for ${epic} on ${latest} listed but failed to load.`);
  }
  return snapshot;
}

/** The snapshot immediately before `date` in that epic's history, or
 *  null if `date` is the first one (or isn't found at all). Used to
 *  compute since-last-snapshot deltas — never fabricated when there's no
 *  real prior snapshot. */
export async function loadPreviousSnapshot(epic: string, date: string): Promise<StatusSnapshot | null> {
  const dates = listSnapshotDates(epic);
  const index = dates.indexOf(date);
  if (index <= 0) return null;
  return loadSnapshot(epic, dates[index - 1]!);
}

/** The handful of numbers every page needs about the *previous* snapshot,
 *  without the snapshot. See loadPreviousSummary. */
export type PreviousSummary = {
  date: string;
  /** Weighted epic completion as of that snapshot — the header's
   *  "▲ 3 pts since last snapshot". */
  percent: number;
  /** Each feature's score then, keyed by JIRA key (never array position —
   *  features reorder between days). Drives the feature page's
   *  "vs. previous snapshot" delta. */
  scoreByFeature: Record<string, number>;
};

/**
 * The previous snapshot, reduced to what the shell chrome actually reads
 * off it.
 *
 * The shell used to hand every page the whole previous snapshot so that
 * three components could compute three deltas from it. Two of those
 * deltas are a single number each, and the third is one number per
 * feature — about 600 bytes all told, against ~120KB for the snapshot
 * they were being derived from. Because a route loader's result is
 * serialised into that page's prerendered HTML, that difference was paid
 * on all eleven pages, including the Config page, which renders a YAML
 * file and reads none of it.
 *
 * The one page that genuinely needs the whole previous snapshot — Today,
 * which diffs it story by story — loads it in its own route loader
 * instead.
 */
export async function loadPreviousSummary(epic: string, date: string): Promise<PreviousSummary | null> {
  const previous = await loadPreviousSnapshot(epic, date);
  if (!previous) return null;
  return {
    date: previous.date,
    percent: epicProgress(epic, previous.features).percent,
    scoreByFeature: Object.fromEntries(previous.features.map((f) => [f.key, f.score])),
  };
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
export async function loadScopeHistory(epic: string, upTo?: string): Promise<ScopeSnapshot[]> {
  const dates = listSnapshotDates(epic)
    .filter((d) => (upTo ? d <= upTo : true))
    .slice(-SCOPE_WINDOW);
  const loaded = await Promise.all(dates.map((d) => loadSnapshot(epic, d)));
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
export async function loadSnapshotDaysBefore(epic: string, date: string, days: number): Promise<StatusSnapshot | null> {
  const dates = listSnapshotDates(epic).filter((d) => d < date);
  if (dates.length === 0) return null;
  const cutoff = new Date(new Date(date).getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // The newest snapshot at or before the cutoff, else the oldest there is.
  const target = [...dates].reverse().find((d) => d <= cutoff) ?? dates[0]!;
  return loadSnapshot(epic, target);
}

export type HistoryPoint = {
  date: string;
  generatedAt: string;
  kpis: StatusSnapshot["kpis"];
};

/** date + kpis + generatedAt for every snapshot of one epic, ascending —
 *  the burn-up chart's full history. Deliberately excludes `features` (no
 *  need to ship every historical feature list just to draw
 *  shipped/doneUnverified/staged-over-time).
 *
 *  Uncapped, unlike loadScopeHistory. The burn-up is drawn from
 *  `history[0].date` — the day collection started — so trimming the front
 *  of this list would not trim the chart's payload so much as silently
 *  redraw the chart from a later origin, which is a different claim about
 *  the epic. A point is ~180 bytes and it is loaded by the Today route
 *  alone, so a year of daily collection costs that one page ~65KB. If
 *  that ever needs bounding, downsample the old end (weekly before the
 *  last 30 days) rather than dropping it, so the arc still starts where
 *  the work did. */
export async function loadHistory(epic: string): Promise<HistoryPoint[]> {
  const dates = listSnapshotDates(epic);
  const points = await Promise.all(
    dates.map(async (date) => {
      const snapshot = await loadSnapshot(epic, date);
      if (!snapshot) return null;
      return { date: snapshot.date, generatedAt: snapshot.generatedAt, kpis: snapshot.kpis };
    }),
  );
  return points.filter((p): p is HistoryPoint => p !== null);
}
