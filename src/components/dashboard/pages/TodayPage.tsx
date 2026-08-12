import { computeChanges, formatSinceLabel } from "@/lib/dashboard/diff"
import { buildBurnUpSeries } from "@/lib/dashboard/burnup"
import { matchesFilters } from "@/lib/dashboard/search"
import { sidebarGroups } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { StaleBanner } from "../StaleBanner"
import { Callout } from "../Callout"
import { ChangeFeedItem } from "../ChangeFeedItem"
import { FeatureRow } from "../FeatureRow"
import { FilterBar } from "../FilterBar"
import { EmptyState } from "../EmptyState"
import { SubtaskStatusMixChart } from "../SubtaskStatusMixChart"
import { BurnUpChart } from "../BurnUpChart"
import { MethodologyFooter } from "../MethodologyFooter"

/**
 * The landing page answers "what changed, and where does that leave us" in
 * that order — the change feed sits above the totals deliberately, because
 * the totals are what you already knew and the feed is what you opened the
 * dashboard to find out.
 */
export function TodayPage() {
  const { snapshot, previous, history, search, onSearchChange, now } = useShell()

  const changes = computeChanges(snapshot, previous)
  const engineers = [...new Set(snapshot.features.map((f) => f.owner))].sort()
  const burnUp = buildBurnUpSeries(history, history[0]?.date ?? snapshot.date, snapshot.epic.targetDate)
  const groups = sidebarGroups(snapshot)

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-3">
        <StaleBanner generatedAt={snapshot.generatedAt} now={now} />
        <p className="font-display m-0 max-w-[28ch] text-3xl leading-[1.1] sm:text-4xl">
          {snapshot.headline.sentence}
        </p>
        {snapshot.epic.overview ? (
          <p className="m-0 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{snapshot.epic.overview}</p>
        ) : null}
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
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note={previous ? `${previous.date} → ${snapshot.date}` : undefined}>
          {previous ? capitalize(formatSinceLabel(previous.date, snapshot.date)) : "Since the previous snapshot"}
        </SectionHeading>
        {!previous ? (
          <EmptyState message="This is the first snapshot on record — nothing to compare against yet." />
        ) : changes.length === 0 ? (
          <EmptyState message={`Nothing changed ${formatSinceLabel(previous.date, snapshot.date)}.`} />
        ) : (
          <ul className="surface m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-border bg-card p-0">
            {changes.map((change, i) => (
              <ChangeFeedItem key={i} change={change} />
            ))}
          </ul>
        )}
      </section>

      <StatStrip
        stats={[
          {
            label: "Features tracked",
            value: snapshot.kpis.featuresTracked,
            sublabel:
              snapshot.kpis.lightTierMilestones > 0 ? `${snapshot.kpis.lightTierMilestones} light tier` : undefined,
          },
          { label: "Subtasks tracked", value: snapshot.kpis.subtasksTracked },
          { label: "Shipped to master", value: snapshot.kpis.shipped, color: "var(--status-shipped)" },
          { label: "Staged, not shipped", value: snapshot.kpis.staged, color: "var(--status-staged)" },
          { label: "In review", value: snapshot.kpis.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: snapshot.kpis.blockedOrTodo,
            color: snapshot.kpis.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />

      <section className="flex flex-col gap-4">
        <SectionHeading note={`${snapshot.features.length} in this snapshot`}>Features</SectionHeading>
        <FilterBar search={search} onSearchChange={onSearchChange} engineers={engineers} />
        {groups.map((group) => {
          const visible = group.features.filter((f) => matchesFilters(f, search, now))
          return (
            <div key={group.id} className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <h3 className="eyebrow m-0 font-normal">{group.label}</h3>
                {group.overview ? (
                  <p className="m-0 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">{group.overview}</p>
                ) : null}
              </div>
              {visible.length === 0 ? (
                <EmptyState message="No features here match the current filters." />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {visible.map((feature) => (
                    <FeatureRow key={feature.key} feature={feature} />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <SubtaskStatusMixChart features={snapshot.features} />
      <BurnUpChart series={burnUp} targetDate={snapshot.epic.targetDate} />
      <MethodologyFooter snapshot={snapshot} />
    </div>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
