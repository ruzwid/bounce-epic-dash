import { Suspense, lazy, memo, useSyncExternalStore } from "react"
import type { ComponentProps, ReactNode } from "react"
import { MIN_HISTORY_FOR_CHART } from "@/lib/dashboard/burnup"
import type { BurnUpChart as BurnUpChartImpl } from "./BurnUpChart"
import type { StoryStatusMixChart as StoryStatusMixChartImpl } from "./StoryStatusMixChart"
import { SectionHeading } from "./SectionHeading"
import { EmptyState } from "./EmptyState"

/**
 * The two Recharts charts, kept off the landing page's critical path.
 *
 * Recharts is ~300KB of the Today page's JavaScript — more than everything
 * else on the page put together — and it draws nothing at all until the
 * browser has measured the DOM: the prerendered HTML for both charts is an
 * empty, correctly-sized `div`, because ResponsiveContainer has no width
 * to work with on the server. So the library was being downloaded and
 * parsed before hydration in order to produce, at that moment, exactly
 * what the static HTML already showed.
 *
 * Loading it after mount instead costs the charts a beat — they are the
 * last two sections on the page, below the change feed, the KPI row and
 * every feature — and gets the part of the page people actually read
 * interactive without waiting for a charting library.
 *
 * The mount gate matters as much as the `lazy` call. Left to Suspense
 * alone, the prerenderer would resolve the import (it is a plain module in
 * Node), render the chart into the HTML, and the client would then need
 * the chunk *before* hydration in order to match it — putting the whole
 * library back on the critical path, just less visibly.
 *
 * Both are `memo`ed on the way past. Changing a filter re-renders the
 * Today page, and without this a chart that shows the whole epic
 * regardless of filters would re-run Recharts' layout on every chip click.
 */

const LazyBurnUpChart = lazy(() => import("./BurnUpChart").then((m) => ({ default: m.BurnUpChart })))
const LazyStoryStatusMixChart = lazy(() =>
  import("./StoryStatusMixChart").then((m) => ({ default: m.StoryStatusMixChart })),
)

function subscribe() {
  return () => {}
}

function getClientSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

/** False through SSR and hydration, true once the client has taken over —
 *  via useSyncExternalStore rather than a mount effect, so React itself
 *  reconciles the server/client mismatch on its normal hydration pass
 *  instead of this component costing an extra render to notice it mounted.
 *  See https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store */
function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}

/** A chart's frame with its content still to come, holding the exact
 *  height the chart will occupy so that swapping the real one in moves
 *  nothing below it.
 *
 *  The heading is the real heading, not a skeleton: it is text, it is
 *  already correct, and a shimmering block where a title goes is just a
 *  worse title. */
function ChartFrame({ heading, note, children }: { heading: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note={note}>{heading}</SectionHeading>
      {children}
    </section>
  )
}

/** The empty box standing in for a chart, at the chart's own height. */
function ChartSpacer({ height }: { height: string }) {
  return (
    <div className="surface rounded-4xl border border-border bg-card p-4">
      <div className={`w-full ${height}`} aria-hidden="true" />
    </div>
  )
}

export const BurnUpChart = memo(function BurnUpChart(props: ComponentProps<typeof BurnUpChartImpl>) {
  const mounted = useMounted()
  const note = props.targetDate ? `against the ${props.targetDate} target` : "no target date set"

  // Too little history to plot: the real component renders this same empty
  // state and no chart, so reserving a chart's worth of height for it would
  // guarantee the one layout shift this wrapper exists to avoid.
  const placeholder =
    props.series.length < MIN_HISTORY_FOR_CHART ? (
      <ChartFrame heading="Burn-up" note={note}>
        <EmptyState message="Not enough history yet — the burn-up needs at least three snapshots." />
      </ChartFrame>
    ) : (
      <ChartFrame heading="Burn-up" note={note}>
        {/* h-80, matching the chart container in BurnUpChart itself. */}
        <ChartSpacer height="h-80" />
      </ChartFrame>
    )

  if (!mounted) return placeholder
  return (
    <Suspense fallback={placeholder}>
      <LazyBurnUpChart {...props} />
    </Suspense>
  )
})

export const StoryStatusMixChart = memo(function StoryStatusMixChart(
  props: ComponentProps<typeof StoryStatusMixChartImpl>,
) {
  const mounted = useMounted()
  const placeholder = (
    <ChartFrame heading="Story status mix" note="one bar per feature">
      {/* h-72, matching the chart container in StoryStatusMixChart itself. */}
      <ChartSpacer height="h-72" />
    </ChartFrame>
  )

  if (!mounted) return placeholder
  return (
    <Suspense fallback={placeholder}>
      <LazyStoryStatusMixChart {...props} />
    </Suspense>
  )
})
