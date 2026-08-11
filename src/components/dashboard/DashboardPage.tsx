import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import type { DashboardSearch } from "@/lib/dashboard/search"
import { matchesFilters } from "@/lib/dashboard/search"
import { computeChanges, formatSinceLabel } from "@/lib/dashboard/diff"
import { featureAnchorId, useScrollToHash } from "@/lib/dashboard/anchors"
import { buildBurnUpSeries } from "@/lib/dashboard/burnup"
import type { HistoryPoint } from "@/lib/dashboard/snapshots"
import { DashboardHeader } from "./DashboardHeader"
import { FilterBar } from "./FilterBar"
import { FeatureCard } from "./FeatureCard"
import { ChangeFeedItem } from "./ChangeFeedItem"
import { KpiStat } from "./KpiStat"
import { EmptyState } from "./EmptyState"
import { Callout } from "./Callout"
import { SubtaskStatusMixChart } from "./SubtaskStatusMixChart"
import { BurnUpChart } from "./BurnUpChart"
import { ReviewQueueTable } from "./ReviewQueueTable"
import { MethodologyFooter } from "./MethodologyFooter"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

type DashboardPageProps = {
  snapshot: StatusSnapshotT
  previous: StatusSnapshotT | null
  history: HistoryPoint[]
  search: DashboardSearch
  onSearchChange: (updates: Partial<DashboardSearch>) => void
  now: Date
}

export function DashboardPage({ snapshot, previous, history, search, onSearchChange, now }: DashboardPageProps) {
  useScrollToHash()

  const previousByKey = new Map((previous?.features ?? []).map((f) => [f.key, f]))
  const engineers = [...new Set(snapshot.features.map((f) => f.owner))].sort()
  const changes = computeChanges(snapshot, previous)
  const m1Features = snapshot.features.filter((f) => f.milestone === "M1").filter((f) => matchesFilters(f, search, now))
  const lightFeatures = snapshot.features
    .filter((f) => f.milestone === "M3" || f.milestone === "M4")
    .filter((f) => matchesFilters(f, search, now))
  // StatusSnapshot.epic has no startDate (that's a config.yaml/pipeline-only
  // field, not part of the published contract) — the earliest snapshot we
  // actually have history for is the only real starting point to plot from.
  const burnUp = buildBurnUpSeries(history, history[0]?.date ?? snapshot.date, snapshot.epic.targetDate)

  return (
    <main className="page-wrap flex flex-col gap-8 py-6 sm:py-10">
      {/* 1. Header */}
      <DashboardHeader snapshot={snapshot} now={now} />

      {/* 2. Headline — the release gate. Largest text on the page. */}
      <section className="flex flex-col gap-3">
        <p className="m-0 text-2xl font-semibold leading-tight sm:text-4xl">{snapshot.headline.sentence}</p>
        {snapshot.collectionErrors.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {snapshot.collectionErrors.map((error, i) => (
              <Callout
                key={i}
                callout={{
                  type: "spec_gap",
                  severity: "warn",
                  message: `[${error.source}] ${error.scope}: ${error.message}`,
                  refs: [],
                }}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* 3. Since last snapshot */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {previous ? formatSinceLabel(previous.date, snapshot.date) : "Since the previous snapshot"}
        </h2>
        {!previous ? (
          <EmptyState message="This is the first snapshot on record — nothing to compare against yet." />
        ) : changes.length === 0 ? (
          <EmptyState message={`Nothing changed ${formatSinceLabel(previous.date, snapshot.date)}.`} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {changes.map((change, i) => (
              <ChangeFeedItem key={i} change={change} />
            ))}
          </div>
        )}
      </section>

      {/* 4. KPI row */}
      <section className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <KpiStat
          label="Features tracked"
          value={snapshot.kpis.featuresTracked}
          sublabel={snapshot.kpis.lightTierMilestones > 0 ? `+${snapshot.kpis.lightTierMilestones} light-tier` : undefined}
        />
        <KpiStat label="Subtasks tracked" value={snapshot.kpis.subtasksTracked} />
        <KpiStat label="Shipped to master" value={snapshot.kpis.shipped} />
        <KpiStat label="Staged, not shipped" value={snapshot.kpis.staged} />
        <KpiStat label="In review" value={snapshot.kpis.inReview} />
        <KpiStat label="Blocked / to do" value={snapshot.kpis.blockedOrTodo} />
      </section>

      {/* 5. Filters (sticky) + jump-to anchors */}
      <section className="flex flex-col gap-3">
        <nav aria-label="Jump to feature" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Jump to:</span>
          {snapshot.features
            .filter((f) => f.milestone === "M1")
            .map((f) => (
              <a key={f.key} href={`#${featureAnchorId(f.code)}`} className="font-mono-data underline">
                {f.code}
              </a>
            ))}
          <a href="#m3-m4" className="underline">
            M3/M4
          </a>
        </nav>
        <FilterBar search={search} onSearchChange={onSearchChange} engineers={engineers} />
      </section>

      {/* 6. M1, full tier */}
      <section className="flex flex-col gap-4">
        {m1Features.length === 0 ? (
          <EmptyState message="No M1 features match the current filters." />
        ) : (
          m1Features.map((feature) => (
            <div key={feature.key} id={featureAnchorId(feature.code)} className="scroll-mt-16">
              <FeatureCard feature={feature} previousFeature={previousByKey.get(feature.key) ?? null} tier="full" />
            </div>
          ))
        )}
      </section>

      {/* 7. M3/M4, light tier */}
      <section id="m3-m4" className="scroll-mt-16 flex flex-col gap-4">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">M3 / M4 — light tier</h2>
        {lightFeatures.length === 0 ? (
          <EmptyState message="No M3/M4 features match the current filters." />
        ) : (
          lightFeatures.map((feature) => (
            <FeatureCard key={feature.key} feature={feature} previousFeature={previousByKey.get(feature.key) ?? null} tier="light" />
          ))
        )}
      </section>

      {/* 8. Stacked subtask status mix */}
      <SubtaskStatusMixChart features={snapshot.features} />

      {/* 9. Burn-up */}
      <BurnUpChart series={burnUp} targetDate={snapshot.epic.targetDate} />

      {/* 10. Review queue */}
      <ReviewQueueTable reviewQueue={snapshot.reviewQueue} />

      {/* 11. Methodology footer */}
      <MethodologyFooter snapshot={snapshot} />
    </main>
  )
}
