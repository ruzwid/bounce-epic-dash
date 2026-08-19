// src/lib/dashboard/burnup.ts
// The burn-up series: what has actually landed over time, the scope it is
// landing against, and — past today — where the observed rate points.
//
// Actual and projected are separate fields rather than one series with a
// style change, so nothing in the chart can draw a forecast as though it
// were a measurement.
import type { HistoryPoint } from "./snapshots.ts";
import type { Velocity } from "./velocity.ts";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Two points is a line, not a trend — but three days of real snapshots
 *  says more than an empty panel promising a chart in a fortnight.
 *
 *  Lives here rather than beside the chart that enforces it so the
 *  deferred-chart wrapper can tell whether a chart is going to be drawn at
 *  all, without importing the chart (and Recharts with it) to find out. */
export const MIN_HISTORY_FOR_CHART = 3;

export type BurnUpPoint = {
  date: string;
  /** Measured counts. Undefined on projected points, which is what leaves
   *  a gap in the actual series rather than a line drawn to zero. */
  shipped?: number;
  doneUnverified?: number;
  staged?: number;
  /** Scope. Flat-extended across projected points — scope isn't forecast,
   *  it's just carried forward at today's value. */
  total: number;
  /** Straight line from where the epic stood at its first snapshot to
   *  (targetDate, final scope) — the steady rate that would land every
   *  story by the target. Anchored to the work already done at the first
   *  snapshot rather than to zero: this dashboard started mid-epic, and a
   *  line drawn from zero would claim the team had to build all 74
   *  stories in the fortnight since, which flatters the early days and
   *  panics the later ones. Null when no target date is configured. */
  pace: number | null;
  /** Done stories projected forward at the observed rate, anchored to
   *  today's actual. Null before today, so the two series meet exactly
   *  once, at the join. */
  projected: number | null;
  /** True for points after the last snapshot — the chart uses it to tell
   *  measured dates from projected ones on the axis and in the tooltip. */
  isProjection: boolean;
};

function addDays(date: string, days: number): string {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY;
}

/** How many points to draw between today and the horizon. Weekly steps
 *  keep the x-axis readable when the forecast is months out, without
 *  changing the line's shape — it's straight either way. */
const PROJECTION_STEP_DAYS = 7;

/**
 * shipped/doneUnverified/staged/total over time, plus the pace line and —
 * when there's a measured rate — a projection running from today to
 * whichever comes last, the forecast landing or the target date.
 *
 * `finalTotal` (the scope the pace line aims at) is the most recent
 * point's storiesTracked: a single fixed target, so the dashed line stays
 * straight instead of wobbling as scope changes snapshot to snapshot.
 */
export function buildBurnUpSeries(
  history: HistoryPoint[],
  startDate: string,
  targetDate: string | null,
  velocity: Velocity | null = null,
): BurnUpPoint[] {
  if (history.length === 0) return [];

  const last = history[history.length - 1]!;
  const finalTotal = last.kpis.storiesTracked;
  const startMs = new Date(startDate).getTime();
  const targetMs = targetDate ? new Date(targetDate).getTime() : null;

  const first = history[0]!;
  const doneAtStart = first.kpis.shipped + first.kpis.doneUnverified;

  const paceAt = (date: string): number | null => {
    if (targetMs === null || targetMs <= startMs) return null;
    const fraction = Math.min(1, Math.max(0, (new Date(date).getTime() - startMs) / (targetMs - startMs)));
    return Math.round(doneAtStart + (finalTotal - doneAtStart) * fraction);
  };

  const actual: BurnUpPoint[] = history.map((point) => ({
    date: point.date,
    shipped: point.kpis.shipped,
    doneUnverified: point.kpis.doneUnverified,
    staged: point.kpis.staged,
    total: point.kpis.storiesTracked,
    pace: paceAt(point.date),
    projected: null,
    isProjection: false,
  }));

  if (!velocity || velocity.perDay <= 0) return actual;

  // The projection ends at the later of the forecast landing and the
  // target date, so a run that finishes early still shows the target, and
  // one that runs late still shows where it lands.
  const doneNow = velocity.done;
  const horizon = [velocity.forecastDate, targetDate].filter((d): d is string => d !== null).sort().at(-1);
  if (!horizon || daysBetween(last.date, horizon) <= 0) return actual;

  // Anchor: the projection's first point is today's real figure, so the
  // forecast line starts exactly where the measured one stops.
  const projection: BurnUpPoint[] = [
    { date: last.date, total: finalTotal, pace: paceAt(last.date), projected: doneNow, isProjection: false },
  ];

  const horizonDays = daysBetween(last.date, horizon);
  for (let offset = PROJECTION_STEP_DAYS; offset < horizonDays; offset += PROJECTION_STEP_DAYS) {
    const date = addDays(last.date, offset);
    projection.push({
      date,
      total: finalTotal,
      pace: paceAt(date),
      projected: Math.min(finalTotal, Math.round(doneNow + velocity.perDay * offset)),
      isProjection: true,
    });
  }
  projection.push({
    date: horizon,
    total: finalTotal,
    pace: paceAt(horizon),
    projected: Math.min(finalTotal, Math.round(doneNow + velocity.perDay * horizonDays)),
    isProjection: true,
  });

  // The anchor point is merged into the last actual point rather than
  // appended: two rows with the same date would give the x-axis a
  // duplicate tick and split the tooltip in two.
  const merged = actual.slice(0, -1);
  merged.push({ ...actual[actual.length - 1]!, projected: projection[0]!.projected });
  return [...merged, ...projection.slice(1)];
}
