import { featureSlug, openPullRequests } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { PrChip } from "../PrChip"
import { PersonChip } from "../PersonChip"
import { EmptyState } from "../EmptyState"

/**
 * Two lists, in the order they need acting on: reviews GitHub is actively
 * waiting on somebody for, then every other open pull request. The second
 * list exists because a snapshot can legitimately have no outstanding
 * *requests* while still having open work — showing only the queue would
 * make that read as "nothing in flight".
 */
export function ReviewsPage() {
  const { snapshot } = useShell()

  const queue = [...snapshot.reviewQueue].sort((a, b) => b.ageDays - a.ageDays)
  const open = openPullRequests(snapshot)
  const queuedKeys = new Set(queue.map((r) => `${r.pr.repo}#${r.pr.number}`))
  const unrequested = open.filter(({ pr }) => !queuedKeys.has(`${pr.repo}#${pr.number}`))
  const oldest = queue[0]?.ageDays ?? null

  // A subtask JIRA calls "in review" with no open pull request behind it.
  // This is why the header's "in review" count and the open-PR count on
  // this page can disagree — so the disagreement is shown, not hidden.
  const unbackedInReview = snapshot.features.flatMap((feature) =>
    feature.subtasks
      .filter((subtask) => subtask.status === "in_review" && subtask.prs.every((pr) => pr.state !== "OPEN"))
      .map((subtask) => ({ feature, subtask })),
  )

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">Reviews</h1>
        <p className="m-0 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Every open pull request across the epic's repositories, and who each one is waiting on.
        </p>
      </header>

      <StatStrip
        stats={[
          { label: "Waiting on a reviewer", value: queue.length, color: queue.length > 0 ? "var(--status-in-review)" : undefined },
          { label: "Open pull requests", value: open.length },
          { label: "Oldest request", value: oldest === null ? "—" : `${oldest}d`, color: oldest !== null && oldest > 2 ? "var(--status-in-progress)" : undefined },
        ]}
      />

      <section className="flex flex-col gap-3">
        <SectionHeading note={queue.length > 0 ? "oldest first" : undefined}>Waiting on a reviewer</SectionHeading>
        {queue.length === 0 ? (
          <EmptyState message="No outstanding review requests in this snapshot." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {queue.map((review) => (
              <li
                key={`${review.pr.repo}-${review.pr.number}-${review.reviewer}`}
                className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-5 py-3.5"
              >
                <PrChip pr={review.pr} />
                <span className="min-w-0 flex-1 truncate text-sm">{review.pr.title}</span>
                <PersonChip login={review.reviewer} />
                <span
                  className="font-mono-data shrink-0 text-xs"
                  style={{ color: review.ageDays > 2 ? "var(--status-in-progress)" : "var(--muted-foreground)" }}
                >
                  {review.ageDays}d
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note={unrequested.length > 0 ? "no reviewer requested" : undefined}>
          Other open pull requests
        </SectionHeading>
        {unrequested.length === 0 ? (
          <EmptyState message="Every open pull request already has a reviewer requested." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unrequested.map(({ feature, subtask, pr }) => (
              <li
                key={`${pr.repo}#${pr.number}`}
                className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-5 py-3.5"
              >
                <PrChip pr={pr} />
                <span className="min-w-0 flex-1 truncate text-sm">{pr.title}</span>
                <ShellLink
                  page="feature"
                  code={featureSlug(feature.code)}
                  className="font-mono-data shrink-0 text-xs text-muted-foreground"
                >
                  {feature.code}
                </ShellLink>
                <span className="font-mono-data shrink-0 text-xs text-muted-foreground">{subtask.key}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {unbackedInReview.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading note="tracked as in review, but no pull request is open">
            Nothing to review yet
          </SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unbackedInReview.map(({ feature, subtask }) => (
              <li
                key={subtask.key}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-dashed border-border px-5 py-3.5"
              >
                <span className="font-mono-data shrink-0 text-xs text-muted-foreground">{subtask.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{subtask.summary}</span>
                <ShellLink
                  page="feature"
                  code={featureSlug(feature.code)}
                  className="font-mono-data shrink-0 text-xs text-muted-foreground"
                >
                  {feature.code}
                </ShellLink>
              </li>
            ))}
          </ul>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            These count towards the epic's "in review" figure because JIRA says so, but there is no open pull request
            backing the claim in any tracked repository.
          </p>
        </section>
      ) : null}
    </div>
  )
}
