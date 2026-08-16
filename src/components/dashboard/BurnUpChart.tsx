import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import type { BurnUpPoint } from "@/lib/dashboard/burnup"
import type { Velocity } from "@/lib/dashboard/velocity"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { SectionHeading } from "./SectionHeading"
import { ChartKey } from "./ChartKey"
import { EmptyState } from "./EmptyState"

type BurnUpChartProps = {
  series: BurnUpPoint[]
  targetDate: string | null
  velocity: Velocity | null
}

/** Two points is a line, not a trend — but three days of real snapshots
 *  says more than an empty panel promising a chart in a fortnight. */
const MIN_HISTORY_FOR_CHART = 3

const chartConfig = {
  shipped: { label: "Shipped", color: "var(--status-shipped)" },
  doneUnverified: { label: "Done, unverified", color: "var(--status-done-unverified)" },
  staged: { label: "Staged", color: "var(--status-staged)" },
  total: { label: "Scope", color: "var(--muted-foreground)" },
  // Achromatic on purpose: in this interface colour means work status,
  // and a projection is not a status. The two forecast lines are told
  // apart by weight and dash pattern instead, which also keeps them from
  // competing with the three measured areas underneath.
  projected: { label: "At current rate", color: "var(--foreground)" },
  pace: { label: "Pace for target", color: "var(--muted-foreground)" },
} satisfies ChartConfig

// Explicit legend order — see the note in StoryStatusMixChart.
const SERIES = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** "11 Aug". Rendered in UTC so a prerendered page and a browser in any
 *  timezone print the same tick (a locale-dependent render would
 *  hydrate-mismatch). */
function formatDay(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ms))
}

export function BurnUpChart({ series, targetDate, velocity }: BurnUpChartProps) {
  if (series.length < MIN_HISTORY_FOR_CHART) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeading note={targetDate ? `against the ${targetDate} target` : "no target date set"}>
          Burn-up
        </SectionHeading>
        <EmptyState message="Not enough history yet — the burn-up needs at least three snapshots." />
      </section>
    )
  }

  // A time axis, not a category axis: the measured points are daily and the
  // projected ones weekly, so spacing them evenly would compress the
  // forecast and make a fortnight away look like tomorrow.
  const data = series.map((point) => ({ ...point, t: new Date(point.date).getTime() }))
  const lastActual = [...data].reverse().find((point) => !point.isProjection)
  const domain: [number, number] = [data[0]!.t, data[data.length - 1]!.t]
  const targetMs = targetDate ? new Date(targetDate).getTime() : null
  const hasProjection = data.some((point) => point.isProjection)

  // Weekly ticks across the whole span: with a mix of daily history and
  // weekly projection, letting Recharts choose gives clusters at the left
  // and gaps at the right.
  const ticks: number[] = []
  for (let t = domain[0]; t <= domain[1]; t += 7 * MS_PER_DAY) ticks.push(t)
  if (domain[1] - ticks[ticks.length - 1]! > 2 * MS_PER_DAY) ticks.push(domain[1])

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note={targetDate ? `against the ${targetDate} target` : "no target date set"}>
        Burn-up
      </SectionHeading>

      {velocity ? <ForecastLine velocity={velocity} /> : null}

      <div className="surface rounded-4xl border border-border bg-card p-4">
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <ComposedChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            {/* Solid hairlines: a dashed grid reads as "projection", which
                is a meaning this chart uses for an actual projection. */}
            <CartesianGrid vertical={false} stroke="var(--border-soft)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={domain}
              ticks={ticks}
              tickFormatter={formatDay}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={16}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={30} allowDecimals={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as (BurnUpPoint & { t: number }) | undefined
                    if (!point) return ""
                    return point.isProjection ? `${formatDay(point.t)} · projected` : formatDay(point.t)
                  }}
                />
              }
            />

            {/* Scope first, so the fills read as filling it up. */}
            <Line
              type="stepAfter"
              dataKey="total"
              stroke="var(--color-total)"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />

            <Area
              type="monotone"
              dataKey="shipped"
              stackId="burnup"
              stroke="var(--color-shipped)"
              strokeWidth={2}
              fill="var(--color-shipped)"
              fillOpacity={0.14}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="doneUnverified"
              stackId="burnup"
              stroke="var(--color-doneUnverified)"
              strokeWidth={2}
              fill="var(--color-doneUnverified)"
              fillOpacity={0.14}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="staged"
              stackId="burnup"
              stroke="var(--color-staged)"
              strokeWidth={2}
              fill="var(--color-staged)"
              fillOpacity={0.14}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Dashed for the two lines that are not measurements: what the
                target would have required, and where today's rate points. */}
            {targetDate ? (
              <Line
                type="linear"
                dataKey="pace"
                stroke="var(--color-pace)"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}
            {hasProjection ? (
              <Line
                type="linear"
                dataKey="projected"
                stroke="var(--color-projected)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}

            {targetMs !== null && targetMs >= domain[0] && targetMs <= domain[1] ? (
              <ReferenceLine
                x={targetMs}
                stroke="var(--foreground)"
                strokeOpacity={0.45}
                label={{
                  value: "Target",
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            ) : null}

            {/* The one direct label: where measurement stops. Everything
                right of it is arithmetic, not history. */}
            {lastActual && hasProjection ? (
              <ReferenceDot
                x={lastActual.t}
                y={lastActual.projected ?? 0}
                r={4}
                fill="var(--color-projected)"
                stroke="var(--background)"
                strokeWidth={2}
                label={{
                  value: "today",
                  position: "top",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                  offset: 8,
                }}
              />
            ) : null}
          </ComposedChart>
        </ChartContainer>
        <ChartKey
          config={chartConfig}
          keys={SERIES.filter((key) => {
            if (key === "pace") return targetDate !== null
            if (key === "projected") return hasProjection
            return true
          })}
          className="pt-3"
        />
      </div>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Solid areas are measured counts from past snapshots. Both dashed lines are arithmetic, not estimates: the
        faint one is the steady pace that would have hit the target from day one, the other extends the rate actually
        observed. Neither knows about holidays, scope still to be written, or how hard the remaining work is.
      </p>
    </section>
  )
}

/**
 * The forecast as a sentence, above the chart — the number most readers
 * came for, so it should not require reading a line's slope off an axis.
 */
function ForecastLine({ velocity }: { velocity: Velocity }) {
  const rate = velocity.perDay.toFixed(1)
  const window = Math.round(velocity.windowDays)

  if (velocity.remaining === 0) {
    return (
      <p className="m-0 text-sm leading-relaxed">
        All <span className="font-mono-data">{velocity.total}</span> tracked stories are done.
      </p>
    )
  }

  if (!velocity.forecastDate) {
    return (
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">
        No stories finished in the last <span className="font-mono-data">{window}</span> days, so there is no rate to
        project from. <span className="font-mono-data">{velocity.remaining}</span> stories remain.
      </p>
    )
  }

  const late = velocity.daysVsTarget !== null && velocity.daysVsTarget > 0
  const early = velocity.daysVsTarget !== null && velocity.daysVsTarget < 0

  return (
    <p className="m-0 text-sm leading-relaxed">
      <span className="font-mono-data">{velocity.remaining}</span> stories left at{" "}
      <span className="font-mono-data">{rate}</span>/day over the last{" "}
      <span className="font-mono-data">{window}</span> days —{" "}
      <span className="font-medium">landing {formatDay(new Date(velocity.forecastDate).getTime())}</span>
      {velocity.daysVsTarget === null ? (
        <span className="text-muted-foreground">, with no target date to check against</span>
      ) : late ? (
        <span style={{ color: "var(--status-blocked)" }}>
          , <span className="font-mono-data">{velocity.daysVsTarget}</span> days past target
        </span>
      ) : early ? (
        <span style={{ color: "var(--status-shipped)" }}>
          , <span className="font-mono-data">{Math.abs(velocity.daysVsTarget)}</span> days inside target
        </span>
      ) : (
        <span style={{ color: "var(--status-shipped)" }}>, exactly on target</span>
      )}
      .
    </p>
  )
}
