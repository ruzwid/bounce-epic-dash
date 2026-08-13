import { ChevronRight } from "lucide-react"
import { computeChanges, formatSinceLabel } from "@/lib/dashboard/diff"
import { buildBurnUpSeries } from "@/lib/dashboard/burnup"
import { groupMatchesMilestoneFilter, matchesFilters } from "@/lib/dashboard/search"
import { milestoneProgress, sidebarGroups } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { StaleBanner } from "../StaleBanner"
import { Callout } from "../Callout"
import { ChangeFeedItem } from "../ChangeFeedItem"
import { FeatureRow } from "../FeatureRow"
import { FilterBar } from "../FilterBar"
import { EmptyState } from "../EmptyState"
import { StoryStatusMixChart } from "../StoryStatusMixChart"
import { BurnUpChart } from "../BurnUpChart"
import { MethodologyFooter } from "../MethodologyFooter"
import { MilestoneGroupHeading } from "../MilestoneGroupHeading"

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
  // Groups the milestone filter excludes don't render at all — rendering
  // them with an empty, filtered-down feature list is the exact bug this
  // replaced (picking "M1" left M2/M3/M4 on the page, just empty).
  const groups = sidebarGroups(snapshot).filter((g) => groupMatchesMilestoneFilter(g.milestoneIds, search))
  const visibleFeatureCount = groups.reduce(
    (n, g) => n + g.features.filter((f) => matchesFilters(f, search, now)).length,
    0,
  )

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-3">
        <StaleBanner generatedAt={snapshot.generatedAt} now={now} />
        <p className="font-display m-0 max-w-[28ch] text-3xl leading-[1.1] sm:text-4xl">
          {snapshot.headline.sentence}
        </p>
        {snapshot.epic.overview ? (
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">{snapshot.epic.overview}</p>
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
          <ul className="surface m-0 flex list-none flex-col overflow-hidden rounded-4xl border border-border bg-card p-0">
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
          { label: "Stories tracked", value: snapshot.kpis.storiesTracked },
          { label: "Shipped to master", value: snapshot.kpis.shipped, color: "var(--status-shipped)" },
          {
            label: "Done, unverified",
            value: snapshot.kpis.doneUnverified,
            color: "var(--status-done-unverified)",
          },
          { label: "Staged, not shipped", value: snapshot.kpis.staged, color: "var(--status-staged)" },
          { label: "In review", value: snapshot.kpis.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: snapshot.kpis.blockedOrTodo,
            color: snapshot.kpis.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />

      <section className="flex flex-col gap-5">
        <SectionHeading
          note={
            visibleFeatureCount === snapshot.features.length
              ? `${snapshot.features.length} in this snapshot`
              : `${visibleFeatureCount} of ${snapshot.features.length} shown`
          }
        >
          Features
        </SectionHeading>
        <FilterBar search={search} onSearchChange={onSearchChange} engineers={engineers} />
        {groups.length === 0 ? (
          <EmptyState message="No milestone matches the current filters." />
        ) : (
          groups.map((group) => {
            const visible = group.features.filter((f) => matchesFilters(f, search, now))
            // Done milestones collapse by default — nothing left to act on
            // — but the boolean is stable across re-renders (search text,
            // filters) so a reader who expands one anyway never has it
            // snap shut on them mid-session. See the note on <details> in
            // FeatureCard for the same pattern.
            const isDone = milestoneProgress(group.features).stage === "done"
            return (
              <details
                key={group.id}
                className="group flex flex-col gap-3 border-t border-border-soft pt-5 first:border-t-0 first:pt-0"
                open={!isDone}
              >
                <summary className="flex cursor-pointer list-none flex-col gap-1.5 select-none [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-display m-0 flex items-center gap-2 text-[19px] leading-tight">
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90"
                      />
                      <MilestoneGroupHeading group={group} className="hover-fill no-underline" />
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {group.features.length} feature{group.features.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {group.overview ? (
                    <p className="m-0 pl-6 text-sm leading-relaxed text-muted-foreground">{group.overview}</p>
                  ) : null}
                </summary>
                {visible.length === 0 ? (
                  <EmptyState message="No features here match the current filters." />
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {visible.map((feature) => (
                      <FeatureRow key={feature.key} feature={feature} />
                    ))}
                  </ul>
                )}
              </details>
            )
          })
        )}
      </section>

      <StoryStatusMixChart features={snapshot.features} />
      <BurnUpChart series={burnUp} targetDate={snapshot.epic.targetDate} />
      <MethodologyFooter snapshot={snapshot} />
    </div>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
