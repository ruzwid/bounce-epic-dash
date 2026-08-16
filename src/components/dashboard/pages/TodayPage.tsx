import { ChevronRight } from "lucide-react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import type { HistoryPoint } from "@/lib/dashboard/snapshots"
import { computeChanges, formatSinceLabel } from "@/lib/dashboard/diff"
import { buildBurnUpSeries } from "@/lib/dashboard/burnup"
import { computeVelocity, resolveTargetDate } from "@/lib/dashboard/velocity"
import { scopeDelta, storyTotals } from "@/lib/dashboard/totals"
import { groupMatchesMilestoneFilter, matchesFilters } from "@/lib/dashboard/search"
import { milestoneProgress, sidebarGroups } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { SectionHeading } from "../SectionHeading"
import { StatStrip, type Stat } from "../StatStrip"
import { StatusPill } from "../StatusPill"
import { StaleBanner } from "../StaleBanner"
import { Callout } from "../Callout"
import { Hero } from "../Hero"
import { SinceYesterday } from "../SinceYesterday"
import { FeatureRow } from "../FeatureRow"
import { FilterBar } from "../FilterBar"
import { EmptyState } from "../EmptyState"
import { StoryStatusMixChart } from "../StoryStatusMixChart"
import { BurnUpChart } from "../BurnUpChart"
import { MethodologyFooter } from "../MethodologyFooter"
import { MilestoneGroupHeading } from "../MilestoneGroupHeading"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

/**
 * The landing page answers "what changed, and where does that leave us" in
 * that order — the change feed sits above the totals deliberately, because
 * the totals are what you already knew and the feed is what you opened the
 * dashboard to find out.
 */
export function TodayPage() {
  const { snapshot, previous, history, search, onSearchChange, now, asOf } = useShell()

  const changes = computeChanges(snapshot, previous)
  const sinceLabel = previous ? formatSinceLabel(previous.date, snapshot.date) : null
  const engineers = [...new Set(snapshot.features.map((f) => f.owner))].sort()
  // Summed from the features, not read off snapshot.kpis: the published
  // KPI object grew a field at a time, so only this is complete for every
  // snapshot version. See src/lib/dashboard/totals.ts.
  const totals = storyTotals(snapshot.features)
  const scope = scopeDelta(snapshot, previous)
  const targetDate = resolveTargetDate(snapshot)
  const velocity = computeVelocity(history, snapshot, targetDate)
  const burnUp = buildBurnUpSeries(history, history[0]?.date ?? snapshot.date, targetDate, velocity)
  // Groups the milestone filter excludes don't render at all — rendering
  // them with an empty, filtered-down feature list is the exact bug this
  // replaced (picking "M1" left M2/M3/M4 on the page, just empty).
  const groups = sidebarGroups(snapshot).filter((g) => groupMatchesMilestoneFilter(g.milestoneIds, search))
  const visibleFeatureCount = groups.reduce(
    (n, g) => n + g.features.filter((f) => matchesFilters(f, search, asOf)).length,
    0,
  )

  return (
    <div className="flex flex-col gap-9">
      <section className="flex flex-col gap-3">
        <StaleBanner generatedAt={snapshot.generatedAt} now={now} />
        <Hero snapshot={snapshot} changes={changes} sinceLabel={sinceLabel} />
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

      <section className="flex flex-col gap-4">
        <SectionHeading note={previous ? `${previous.date} → ${snapshot.date}` : undefined}>
          {sinceLabel ? capitalize(sinceLabel) : "Since the previous snapshot"}
        </SectionHeading>
        {!previous ? (
          <EmptyState message="This is the first snapshot on record — nothing to compare against yet." />
        ) : changes.length === 0 ? (
          <EmptyState message={`Nothing changed ${sinceLabel}.`} />
        ) : (
          <SinceYesterday changes={changes} />
        )}
      </section>

      <div className="flex flex-col gap-2">
        <StatStrip stats={buildStats(snapshot, totals, scope)} />
        <ScopeNote snapshot={snapshot} scope={scope} sinceLabel={sinceLabel} historyStart={history[0] ?? null} />
      </div>

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
            const visible = group.features.filter((f) => matchesFilters(f, search, asOf))
            // Done milestones collapse by default — nothing left to act on
            // — but the boolean is stable across re-renders (search text,
            // filters) so a reader who expands one anyway never has it
            // snap shut on them mid-session. See the note on <details> in
            // FeatureCard for the same pattern.
            const progress = milestoneProgress(group.features)
            const isDone = progress.stage === "done"
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
                    {/* A done milestone collapses, so the heading is all
                        there is to read — the pill is how a closed section
                        still says where it stands rather than only that it
                        exists. Shown open too: the same fact is worth having
                        either way, and a badge that appeared on collapse
                        would read as a state change. */}
                    <StatusPill status={progress.stage} className="self-center" />
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
      <BurnUpChart series={burnUp} targetDate={targetDate} velocity={velocity} />
      <MethodologyFooter snapshot={snapshot} />
    </div>
  )
}

/**
 * The KPI row.
 *
 * Every story is in exactly one of these figures, and the seven story
 * counts add up to "Stories tracked" — the previous row printed
 * shipped/done-unverified/staged/in-review/blocked-or-to-do, which left
 * in-progress stories in no column at all and fused "someone needs help"
 * with "nobody has started". Blocked gets its own card only when something
 * actually is blocked, so the alarm figure exists when there's an alarm
 * rather than sitting at a permanent zero.
 */
function buildStats(
  snapshot: StatusSnapshotT,
  totals: ReturnType<typeof storyTotals>,
  scope: ReturnType<typeof scopeDelta>,
): Stat[] {
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

  return [
    {
      label: "Features tracked",
      value: snapshot.features.length,
      sublabel:
        scope && scope.features !== 0
          ? `${signed(scope.features)} since last`
          : snapshot.kpis.lightTierMilestones > 0
            ? `${snapshot.kpis.lightTierMilestones} light tier`
            : undefined,
    },
    {
      label: "Stories tracked",
      value: totals.total,
      sublabel: scope && scope.stories !== 0 ? `${signed(scope.stories)} since last` : undefined,
    },
    { label: "Shipped to master", value: totals.shipped, color: "var(--pr-shipped)" },
    { label: "Done, unverified", value: totals.doneUnverified, color: "var(--status-done-unverified)" },
    { label: "Staged, not shipped", value: totals.staged, color: "var(--status-staged)" },
    { label: "Stories in review", value: totals.inReview, color: "var(--status-in-review)" },
    { label: "In progress", value: totals.inProgress, color: "var(--status-in-progress)" },
    { label: "To do", value: totals.todo, color: "var(--status-todo)" },
    ...(totals.blocked > 0
      ? [{ label: "Blocked", value: totals.blocked, color: "var(--status-blocked)" } satisfies Stat]
      : []),
  ]
}

/**
 * Why the percentage moved when nobody shipped anything.
 *
 * Scope is the denominator of every figure above, and it moves: this epic
 * went from 47 stories to 74 in three days, which dropped completion from
 * 79% to 62% without a single piece of work going backwards. Renders only
 * when scope actually changed — on a steady day it would be noise.
 */
function ScopeNote({
  snapshot,
  scope,
  sinceLabel,
  historyStart,
}: {
  snapshot: StatusSnapshotT
  scope: ReturnType<typeof scopeDelta>
  sinceLabel: string | null
  historyStart: HistoryPoint | null
}) {
  const sinceStart =
    historyStart && historyStart.date !== snapshot.date
      ? storyTotals(snapshot.features).total - historyStart.kpis.storiesTracked
      : 0
  if ((!scope || scope.stories === 0) && sinceStart === 0) return null

  const stories = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? "story" : "stories"}`

  const parts: string[] = []
  if (scope && scope.stories !== 0) {
    parts.push(
      `${scope.stories > 0 ? "grew by" : "shrank by"} ${stories(scope.stories)} ${sinceLabel ?? "since the previous snapshot"}`,
    )
  }
  if (sinceStart !== 0 && historyStart) {
    parts.push(`${sinceStart > 0 ? "up" : "down"} ${stories(sinceStart)} since ${historyStart.date}`)
  }

  return (
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">
      Scope {parts.join(", ")}. Percentages move with the denominator, not only with work finishing.
    </p>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
