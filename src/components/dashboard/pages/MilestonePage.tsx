import type { MilestoneOverview } from "@/lib/dashboard/nav"
import { milestoneProgress } from "@/lib/dashboard/nav"
import { StatStrip } from "../StatStrip"
import { StatusPill } from "../StatusPill"
import { FeatureRow } from "../FeatureRow"
import { EmptyState } from "../EmptyState"
import { useShell } from "../shell/ShellContext"
import { JiraLink } from "../JiraLink"

/**
 * One milestone, one page: its own ticket description up top — the goal,
 * in the milestone owner's words, same as a feature's `overview` — then
 * the same weighted-progress figure every feature/epic uses, then every
 * feature that belongs to it. There is no separate "milestone status"
 * concept here on purpose: a milestone is just the sum of its features,
 * so this page and the sidebar/Today groupings can never disagree about
 * how far along one is.
 */
export function MilestonePage({ milestone }: { milestone: MilestoneOverview }) {
  const { epic } = useShell()
  const progress = milestoneProgress(epic, milestone.features)

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono-data">{milestone.id}</span>
          {milestone.owner ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{milestone.owner}</span>
            </>
          ) : null}
          {milestone.tier === "light" ? (
            <>
              <span aria-hidden="true">·</span>
              <span>light tier</span>
            </>
          ) : null}
        </div>
        <h1 className="font-display m-0 text-[28px] leading-tight">
          {milestone.key ? (
            <JiraLink issueKey={milestone.key} type="milestone" tone={progress.stage} className="gap-2" iconClassName="size-5">
              {milestone.title}
            </JiraLink>
          ) : (
            milestone.title
          )}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusPill status={progress.stage} />
        </div>
        {milestone.overview ? (
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">{milestone.overview}</p>
        ) : null}
      </header>

      <StatStrip
        stats={[
          { label: "Features tracked", value: milestone.features.length },
          { label: "Stories tracked", value: progress.storiesTracked },
          { label: "Shipped to master", value: progress.shipped, color: "var(--pr-shipped)" },
          {
            label: "Done, unverified",
            value: progress.doneUnverified,
            color: "var(--status-done-unverified)",
          },
          { label: "Staged, not shipped", value: progress.staged, color: "var(--status-staged)" },
          { label: "Stories in review", value: progress.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: progress.blockedOrTodo,
            color: progress.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />

      <section className="flex flex-col gap-3">
        {milestone.features.length === 0 ? (
          <EmptyState message="No features tracked under this milestone in this snapshot." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {milestone.features.map((feature) => (
              <FeatureRow key={feature.key} feature={feature} />
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
