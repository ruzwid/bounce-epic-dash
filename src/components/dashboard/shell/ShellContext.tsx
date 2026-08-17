import { createContext, useContext } from "react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import type { HistoryPoint } from "@/lib/dashboard/snapshots"
import type { DashboardSearch } from "@/lib/dashboard/search"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

export type ShellValue = {
  /** Which epic is being read — the epics.yaml slug, and the first
   *  segment of every URL in the shell. Carried here rather than derived
   *  from `snapshot.epic.slug` because it is the routing key: every link
   *  ShellLink builds needs it, and it exists before a snapshot does. */
  epic: string
  snapshot: StatusSnapshotT
  previous: StatusSnapshotT | null
  history: HistoryPoint[]
  /** null on the "latest" routes, the YYYY-MM-DD segment on dated ones.
   *  Every link in the shell branches on this so a reader browsing an old
   *  snapshot stays inside that snapshot as they navigate. */
  date: string | null
  /** The reader's own clock, fixed once per shell mount so SSR and
   *  hydration agree. Used for exactly one thing: how old this snapshot
   *  is (the stale banner). Never for ageing the data inside it — see
   *  `asOf`. */
  now: Date
  /** The instant the snapshot was collected. Every age the dashboard
   *  reports — days idle, days a review has been waiting, whether a
   *  feature needs attention — is measured against this, not the reader's
   *  clock, because the snapshot is a record of one moment. Measuring
   *  against `now` meant a three-week-old snapshot claimed a PR had been
   *  waiting three weeks when the record it came from said two days, and
   *  the same page served to two people at different times disagreed
   *  about how many features needed attention. */
  asOf: Date
  search: DashboardSearch
  onSearchChange: (updates: Partial<DashboardSearch>) => void
}

const ShellContext = createContext<ShellValue | null>(null)

export function ShellProvider({ value, children }: { value: ShellValue; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

/**
 * Snapshot data flows layout → pages through React context rather than
 * TanStack's per-route loader hooks. The two shell layouts (`/_shell` for
 * the latest snapshot, `/$date` for a historical one) load the same shape,
 * so a page written against this hook works under both without knowing
 * which route rendered it.
 */
export function useShell(): ShellValue {
  const value = useContext(ShellContext)
  if (!value) throw new Error("useShell must be used inside a ShellProvider — did a page render outside AppShell?")
  return value
}
