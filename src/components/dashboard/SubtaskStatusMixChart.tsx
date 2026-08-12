import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { z } from "zod";
import type { Feature as FeatureSchema } from "@/lib/schema"
import { SUBTASK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"

type FeatureT = z.infer<typeof FeatureSchema>

type SubtaskStatusMixChartProps = {
  features: FeatureT[]
}

const SERIES: { key: keyof FeatureT["scoreBasis"]; color: string; label: string }[] = [
  { key: "shipped", color: "var(--status-shipped)", label: SUBTASK_STATUS_LABELS.shipped },
  { key: "staged", color: "var(--status-staged)", label: SUBTASK_STATUS_LABELS.staged },
  { key: "inReview", color: "var(--status-in-review)", label: SUBTASK_STATUS_LABELS.in_review },
  { key: "inProgress", color: "var(--status-in-progress)", label: SUBTASK_STATUS_LABELS.in_progress },
  { key: "blocked", color: "var(--status-blocked)", label: SUBTASK_STATUS_LABELS.blocked },
  { key: "todo", color: "var(--status-todo)", label: SUBTASK_STATUS_LABELS.todo },
]

/**
 * Stacked bar, one bar per feature. Shipped and staged are always
 * separate stack segments — never pre-summed before charting, which is
 * the whole point of this dashboard.
 */
export function SubtaskStatusMixChart({ features }: SubtaskStatusMixChartProps) {
  const data = features.map((f) => ({ code: f.code, ...f.scoreBasis }))

  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Subtask status mix</h2>
      <div className="surface h-72 w-full rounded-xl border border-border bg-card p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="code" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} allowDecimals={false} />
            {SERIES.map((series) => (
              <Bar key={series.key} dataKey={series.key} stackId="status" fill={series.color} radius={0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Shipped and staged are never summed. A staged bar means review passed but the code is not on master.
      </p>
    </section>
  )
}
