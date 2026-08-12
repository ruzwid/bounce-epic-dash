import { createContext, useContext } from "react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import type { HistoryPoint } from "@/lib/dashboard/snapshots"
import type { DashboardSearch } from "@/lib/dashboard/search"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

export type ShellValue = {
  snapshot: StatusSnapshotT
  previous: StatusSnapshotT | null
  history: HistoryPoint[]
  /** null on the "latest" routes, the YYYY-MM-DD segment on dated ones.
   *  Every link in the shell branches on this so a reader browsing an old
   *  snapshot stays inside that snapshot as they navigate. */
  date: string | null
  /** Fixed once per shell mount so SSR and hydration agree on staleness. */
  now: Date
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
