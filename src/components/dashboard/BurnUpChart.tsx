import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { BurnUpPoint } from "@/lib/dashboard/burnup"
import { EmptyState } from "./EmptyState"

type BurnUpChartProps = {
  series: BurnUpPoint[]
  targetDate: string | null
}

// ~2 weeks of weekday snapshots.
const MIN_HISTORY_FOR_CHART = 10

export function BurnUpChart({ series, targetDate }: BurnUpChartProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Burn-up{targetDate ? ` vs. ${targetDate} target` : ""}
      </h2>
      {series.length < MIN_HISTORY_FOR_CHART ? (
        <EmptyState message="Not enough history yet — check back after a couple of weeks of snapshots." />
      ) : (
        <>
          <div className="h-72 w-full rounded-xl border border-border bg-card p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} allowDecimals={false} />
                <Area type="monotone" dataKey="shipped" stackId="burnup" stroke="var(--status-shipped)" fill="var(--status-shipped)" fillOpacity={0.5} />
                <Area type="monotone" dataKey="staged" stackId="burnup" stroke="var(--status-staged)" fill="var(--status-staged)" fillOpacity={0.5} />
                <Line type="monotone" dataKey="total" stroke="var(--foreground)" strokeWidth={1.5} dot={false} />
                {targetDate ? (
                  <Line type="linear" dataKey="pace" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: "var(--status-shipped)" }} />
              Shipped
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: "var(--status-staged)" }} />
              Staged
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-px w-3 bg-foreground" />
              Total tracked
            </span>
            {targetDate ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-px w-3 border-t border-dashed border-muted-foreground" />
                Pace needed for target
              </span>
            ) : null}
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            The dashed line is the pace needed to hit the target date. The solid lines are the deterministic weighted
            counts, not an estimate.
          </p>
        </>
      )}
    </section>
  )
}
