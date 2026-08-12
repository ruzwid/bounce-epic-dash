import type { ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

/**
 * The legend for a chart, in the order the series are declared.
 *
 * shadcn's ChartLegend is not used here: Recharts sorts a stacked chart's
 * legend by dataKey, which lands on alphabetical — "Blocked" first,
 * "Shipped" buried in the middle — and v3 omits `payload` from Legend's
 * props, so there is no supported way to reorder it. Reading the same
 * ChartConfig the chart is built from keeps the labels and colours from
 * drifting apart, which is the part that actually mattered.
 *
 * Colours come from `config[key].color` rather than the `--color-<key>`
 * variables ChartContainer injects: those are scoped to the container's
 * own `[data-chart]` element, and this key sits outside it.
 */
export function ChartKey({
  config,
  keys,
  className,
}: {
  config: ChartConfig
  keys: string[]
  className?: string
}) {
  return (
    <ul className={cn("m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-1.5 p-0 text-xs", className)}>
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: config[key]?.color }}
          />
          {config[key]?.label}
        </li>
      ))}
    </ul>
  )
}
