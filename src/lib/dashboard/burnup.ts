// src/lib/dashboard/burnup.ts
import type { HistoryPoint } from "./snapshots.ts";

export type BurnUpPoint = {
  date: string;
  shipped: number;
  staged: number;
  total: number;
  /** Straight-line count of subtasks that "should" be shipped by this
   *  date to be on pace for `targetDate` — null when there's no target
   *  date configured. Never an estimate; it's a fixed line from
   *  (startDate, 0) to (targetDate, finalTotal). */
  pace: number | null;
};

/** shipped/staged/total over time, plus the target-date pace line.
 *  `finalTotal` (the scope the pace line aims at) is the most recent
 *  point's subtasksTracked — a single fixed target, so the dashed line is
 *  straight rather than wobbling as scope changes snapshot to snapshot. */
export function buildBurnUpSeries(
  history: HistoryPoint[],
  startDate: string,
  targetDate: string | null,
): BurnUpPoint[] {
  if (history.length === 0) return [];

  const finalTotal = history[history.length - 1]!.kpis.subtasksTracked;
  const startMs = new Date(startDate).getTime();
  const targetMs = targetDate ? new Date(targetDate).getTime() : null;

  return history.map((point) => {
    let pace: number | null = null;
    if (targetMs !== null && targetMs > startMs) {
      const pointMs = new Date(point.date).getTime();
      const fraction = Math.min(1, Math.max(0, (pointMs - startMs) / (targetMs - startMs)));
      pace = Math.round(finalTotal * fraction);
    }
    return {
      date: point.date,
      shipped: point.kpis.shipped,
      staged: point.kpis.staged,
      total: point.kpis.subtasksTracked,
      pace,
    };
  });
}
