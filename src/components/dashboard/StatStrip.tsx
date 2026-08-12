import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  value: ReactNode
  /** A --status-* var, when the number means something on its own (red for
   *  blocked, green for shipped). Left unset for counts that are merely
   *  counts — most of them. */
  color?: string
  sublabel?: string
}

/**
 * Rules top and bottom, hairlines between: numbers read as one row of
 * related facts rather than a set of floating cards. Deliberately not a
 * card grid — the KPI row is a summary of the page below it, and boxing
 * each figure would give six small things the visual weight of six
 * sections.
 */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-wrap border-y border-border py-4", className)}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-[112px] flex-1 border-r border-border-soft px-4 first:pl-0 last:border-r-0"
        >
          <dd className="font-display font-mono-data m-0 text-[26px] leading-tight" style={{ color: stat.color }}>
            {stat.value}
          </dd>
          <dt className="mt-0.5 text-[11.5px] text-muted-foreground">
            {stat.label}
            {stat.sublabel ? <span className="opacity-70"> · {stat.sublabel}</span> : null}
          </dt>
        </div>
      ))}
    </dl>
  )
}
