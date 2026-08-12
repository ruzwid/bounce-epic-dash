import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import type { BurnUpPoint } from "@/lib/dashboard/burnup"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { SectionHeading } from "./SectionHeading"
import { ChartKey } from "./ChartKey"
import { EmptyState } from "./EmptyState"

type BurnUpChartProps = {
  series: BurnUpPoint[]
  targetDate: string | null
}

// ~2 weeks of weekday snapshots.
const MIN_HISTORY_FOR_CHART = 10

const chartConfig = {
  shipped: { label: "Shipped", color: "var(--status-shipped)" },
  staged: { label: "Staged", color: "var(--status-staged)" },
  total: { label: "Total tracked", color: "var(--foreground)" },
  pace: { label: "Pace needed for target", color: "var(--muted-foreground)" },
} satisfies ChartConfig

// Explicit legend order — see the note in SubtaskStatusMixChart.
const SERIES = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

export function BurnUpChart({ series, targetDate }: BurnUpChartProps) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note={targetDate ? `against the ${targetDate} target` : "no target date set"}>
        Burn-up
      </SectionHeading>
      {series.length < MIN_HISTORY_FOR_CHART ? (
        <EmptyState message="Not enough history yet — check back after a couple of weeks of snapshots." />
      ) : (
        <>
          <div className="surface rounded-xl border border-border bg-card p-4">
            <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="shipped"
                  stackId="burnup"
                  stroke="var(--color-shipped)"
                  fill="var(--color-shipped)"
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="staged"
                  stackId="burnup"
                  stroke="var(--color-staged)"
                  fill="var(--color-staged)"
                  fillOpacity={0.45}
                />
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={1.5} dot={false} />
                {targetDate ? (
                  <Line
                    type="linear"
                    dataKey="pace"
                    stroke="var(--color-pace)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
            <ChartKey
              config={chartConfig}
              keys={targetDate ? SERIES : SERIES.filter((key) => key !== "pace")}
              className="pt-3"
            />
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            The dashed line is the pace needed to hit the target date. The solid lines are the deterministic weighted
            counts, not an estimate.
          </p>
        </>
      )}
    </section>
  )
}
