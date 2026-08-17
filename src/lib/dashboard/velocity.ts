// src/lib/dashboard/velocity.ts
// How fast stories are actually finishing, and where that lands relative
// to the target date.
//
// Everything here is arithmetic on snapshots that already exist — an
// observed rate extended in a straight line, not a model. It is stated as
// a range-free single date on purpose: a forecast with false precision is
// worse than an honest "at this rate", and the caller renders the window
// it was measured over next to it so the reader can judge the number.
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../schema.ts";
import type { HistoryPoint } from "./snapshots.ts";
import { doneStories, storyTotals } from "./totals.ts";
import { loadAppConfig } from "./appConfig.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Longest window the rate is measured over. Two working weeks: long
 *  enough that one quiet day doesn't halve the forecast, short enough that
 *  a team that changed pace last week isn't judged on the week before. */
const WINDOW_DAYS = 14;

/** The date this epic is aiming at.
 *
 *  A snapshot records the target that was configured on the day it was
 *  collected, which is the right thing to publish — but it means every
 *  snapshot written before a target existed carries null forever. When
 *  that happens, fall back to the target in config.yaml as it stands now:
 *  the reader is asking "are we going to make it", and the answer they
 *  want is measured against today's plan, not the absence of one three
 *  weeks ago. */
export function resolveTargetDate(snapshot: StatusSnapshotT): string | null {
  return snapshot.epic.targetDate ?? loadAppConfig(snapshot.epic.slug).epic.targetDate ?? null;
}

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY;
}

function addDays(date: string, days: number): string {
  const result = new Date(new Date(date).getTime() + days * MS_PER_DAY);
  return result.toISOString().slice(0, 10);
}

export type Velocity = {
  /** Stories finishing per day, measured over `windowDays`. */
  perDay: number;
  /** How much history the rate is actually measured over — fewer than
   *  WINDOW_DAYS early on, and worth showing so nobody reads a two-day
   *  average as a fortnight's. */
  windowDays: number;
  /** Stories done now, and in total. */
  done: number;
  total: number;
  remaining: number;
  /** When the remaining work lands at this rate, or null when the rate is
   *  zero or negative — no honest date exists then, and inventing one is
   *  the whole failure mode this dashboard exists to avoid. */
  forecastDate: string | null;
  targetDate: string | null;
  /** Days between the forecast and the target: positive is late, negative
   *  is early, null when either date is missing. */
  daysVsTarget: number | null;
};

/**
 * Observed completion rate and where it lands.
 *
 * "Done" is shipped + done_unverified — the same pair that carries weight
 * 1.0 in config.yaml's scoreWeights, so this forecast and the percentage
 * in the header are counting the same thing.
 *
 * The rate is measured across the window rather than between consecutive
 * snapshots: snapshots aren't evenly spaced (a weekend, a rerun on the
 * same day), so counting "done then vs done now, divided by elapsed days"
 * is both simpler and correct where a per-snapshot average isn't.
 */
export function computeVelocity(
  history: HistoryPoint[],
  snapshot: StatusSnapshotT,
  targetDate: string | null,
): Velocity | null {
  const totals = storyTotals(snapshot.features);
  const done = doneStories(totals);
  const remaining = totals.total - done;

  // The window's start: the oldest snapshot no more than WINDOW_DAYS
  // behind the current one, so an epic with a long history still measures
  // its rate over the recent fortnight.
  const inWindow = history.filter((p) => daysBetween(p.date, snapshot.date) <= WINDOW_DAYS);
  const earliest = inWindow[0];
  if (!earliest || earliest.date === snapshot.date) return null;

  const windowDays = daysBetween(earliest.date, snapshot.date);
  if (windowDays <= 0) return null;

  const doneThen = earliest.kpis.shipped + earliest.kpis.doneUnverified;
  const perDay = (done - doneThen) / windowDays;

  const forecastDate = perDay > 0 && remaining > 0 ? addDays(snapshot.date, Math.ceil(remaining / perDay)) : null;
  // Already finished counts as landing today, not "never" — remaining 0
  // with a flat rate is the one case where a zero rate still has an answer.
  const landing = remaining === 0 ? snapshot.date : forecastDate;

  return {
    perDay,
    windowDays,
    done,
    total: totals.total,
    remaining,
    forecastDate: landing,
    targetDate,
    daysVsTarget: landing && targetDate ? Math.round(daysBetween(targetDate, landing)) : null,
  };
}
