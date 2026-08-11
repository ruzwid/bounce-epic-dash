// src/lib/dashboard/staleness.ts
const STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000; // 26 hours

/** Whether `generatedAt` is more than 26h before `now`. `now` is always a
 *  parameter (never `new Date()` inside) so this stays pure and testable,
 *  and safe to call during SSR/prerendering. */
export function isStale(generatedAt: string, now: Date): boolean {
  return now.getTime() - new Date(generatedAt).getTime() > STALE_THRESHOLD_MS;
}
