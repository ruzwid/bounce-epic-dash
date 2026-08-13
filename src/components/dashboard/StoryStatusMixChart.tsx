import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { WORK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { SectionHeading } from "./SectionHeading"
import { ChartKey } from "./ChartKey"

type FeatureT = z.infer<typeof FeatureSchema>

type StoryStatusMixChartProps = {
  features: FeatureT[]
}

// Keys match Feature["scoreBasis"] exactly, so a series can be added by
// adding a status and nothing else. Colours point at the same --status-*
// tokens the pills use, which are theme-aware — so light and dark need no
// separate chart palette.
const chartConfig = {
  shipped: { label: WORK_STATUS_LABELS.shipped, color: "var(--status-shipped)" },
  doneUnverified: { label: WORK_STATUS_LABELS.done_unverified, color: "var(--status-done-unverified)" },
  staged: { label: WORK_STATUS_LABELS.staged, color: "var(--status-staged)" },
  inReview: { label: WORK_STATUS_LABELS.in_review, color: "var(--status-in-review)" },
  inProgress: { label: WORK_STATUS_LABELS.in_progress, color: "var(--status-in-progress)" },
  blocked: { label: WORK_STATUS_LABELS.blocked, color: "var(--status-blocked)" },
  todo: { label: WORK_STATUS_LABELS.todo, color: "var(--status-todo)" },
} satisfies ChartConfig

const SERIES = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

/**
 * Stacked bar, one bar per feature. Shipped and staged are always separate
 * stack segments — never pre-summed before charting, which is the whole
 * point of this dashboard.
 */
export function StoryStatusMixChart({ features }: StoryStatusMixChartProps) {
  const data = features.map((f) => ({ code: f.code, ...f.scoreBasis }))

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note="one bar per feature">Story status mix</SectionHeading>
      <div className="surface rounded-4xl border border-border bg-card p-4">
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="code" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {SERIES.map((key) => (
              <Bar key={key} dataKey={key} stackId="status" fill={`var(--color-${key})`} radius={4} />
            ))}
          </BarChart>
        </ChartContainer>
        <ChartKey config={chartConfig} keys={SERIES} className="pt-3" />
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Shipped and staged are never summed. A staged segment means review passed but the code is not on master. A
        Done-marked story in the same situation shows up in its own "Done, unverified" segment instead of staged.
      </p>
    </section>
  )
}
