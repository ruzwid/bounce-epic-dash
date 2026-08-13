import type { TicketReviewGroup } from "@/lib/dashboard/nav"
import { featureSlug, reviewsByTicket } from "@/lib/dashboard/nav"
import { storyPrs } from "@/lib/stories"
import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { PrChip } from "../PrChip"
import { PersonChip } from "../PersonChip"
import { Avatar } from "../Avatar"
import { JiraLink } from "../JiraLink"
import { EmptyState } from "../EmptyState"

/**
 * One card per ticket, not per pull request: a ticket that opened PRs in
 * three repos used to scatter as three unrelated rows a reader had to
 * notice shared a key. Grouping is the whole redesign — everything else
 * (oldest-wait-first, then "needs a reviewer") is the same priority order
 * the page always used, just applied to tickets instead of rows.
 */
export function ReviewsPage() {
  const { snapshot } = useShell()

  const groups = reviewsByTicket(snapshot)
  const waiting = groups.filter((g) => g.oldestWaitDays !== null)
  const needsReviewer = groups.filter((g) => g.oldestWaitDays === null)
  const openPrCount = groups.reduce((n, g) => n + g.prs.length, 0)
  const oldest = snapshot.reviewQueue.length > 0 ? Math.max(...snapshot.reviewQueue.map((r) => r.ageDays)) : null

  // A story JIRA calls "in review" with no open pull request behind it.
  // This is why the header's "in review" count and the open-PR count on
  // this page can disagree — so the disagreement is shown, not hidden.
  const unbackedInReview = snapshot.features.flatMap((feature) =>
    feature.stories
      .filter((story) => story.status === "in_review" && storyPrs(story).every((pr) => pr.state !== "OPEN"))
      .map((story) => ({ feature, story })),
  )

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">Reviews</h1>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          Every open pull request across the epic's repositories, grouped by ticket, and who each one is waiting on.
        </p>
      </header>

      <StatStrip
        stats={[
          {
            label: "Waiting on a reviewer",
            value: snapshot.reviewQueue.length,
            color: snapshot.reviewQueue.length > 0 ? "var(--status-in-review)" : undefined,
          },
          { label: "Open pull requests", value: openPrCount, sublabel: `${groups.length} ticket${groups.length === 1 ? "" : "s"}` },
          {
            label: "Oldest request",
            value: oldest === null ? "—" : `${oldest}d`,
            color: oldest !== null && oldest > 2 ? "var(--status-in-progress)" : undefined,
          },
        ]}
      />

      <section className="flex flex-col gap-3">
        <SectionHeading note={groups.length > 0 ? "longest-waiting first" : undefined}>
          Open pull requests
        </SectionHeading>
        {groups.length === 0 ? (
          <EmptyState message="No open pull requests in this snapshot." />
        ) : (
          <div className="flex flex-col gap-2">
            {waiting.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {waiting.map((group) => (
                  <ReviewGroupCard key={group.ticket.key} group={group} />
                ))}
              </ul>
            ) : null}
            {waiting.length > 0 && needsReviewer.length > 0 ? (
              <p className="eyebrow m-0 px-1 pt-1 font-normal">No reviewer requested yet</p>
            ) : null}
            {needsReviewer.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {needsReviewer.map((group) => (
                  <ReviewGroupCard key={group.ticket.key} group={group} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {unbackedInReview.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading note="tracked as in review, but no pull request is open">
            Nothing to review yet
          </SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unbackedInReview.map(({ feature, story }) => (
              <li
                key={story.key}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-4xl border border-dashed border-border px-5 py-3.5"
              >
                <span className="font-mono-data shrink-0 text-xs text-muted-foreground">{story.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{story.summary}</span>
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

/**
 * One ticket, one or more PRs. A single-PR ticket (the common case) reads
 * as one flat row, unchanged from before — the ticket key becomes a real
 * Jira link, but nothing gets busier. A multi-PR ticket gets a header
 * naming the ticket once, with its PRs nested under a rule so "these
 * three rows are one piece of work" is a fact of the layout, not
 * something the reader has to infer from matching keys.
 */
function ReviewGroupCard({ group }: { group: TicketReviewGroup }) {
  const { ticket, prs } = group
  const isMulti = prs.length > 1

  return (
    <li className="surface-card flex flex-col gap-2 rounded-4xl border border-border bg-card px-5 py-3.5">
      {isMulti ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <JiraLink
            issueKey={ticket.key}
            {...(ticket.isSubtask ? { type: "subtask" as const } : { type: "story" as const })}
            tone={ticket.status}
            className="gap-1.5 text-[14.5px] font-medium"
          >
            {ticket.summary}
          </JiraLink>
          {ticket.assignee ? (
            <Avatar
              login={loginForDisplayName(ticket.assignee)}
              name={ticket.assignee}
              size={20}
              className="ml-auto shrink-0"
            />
          ) : null}
          <ParentStoryLine ticket={ticket} />
        </div>
      ) : null}
      <ul
        className={cn(
          "m-0 flex list-none flex-col gap-2 p-0",
          isMulti && "ml-1 border-l-2 border-border-soft pl-4",
        )}
      >
        {prs.map(({ pr, waitingOn }) => (
          <li key={`${pr.repo}#${pr.number}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PrChip pr={pr} />
            {!isMulti ? (
              <JiraLink
                issueKey={ticket.key}
                {...(ticket.isSubtask ? { type: "subtask" as const } : { type: "story" as const })}
                tone={ticket.status}
                className="font-mono-data shrink-0 gap-1 text-xs text-muted-foreground"
              >
                {ticket.key}
              </JiraLink>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-sm">{pr.title}</span>
            {!isMulti && ticket.assignee ? (
              <Avatar login={loginForDisplayName(ticket.assignee)} name={ticket.assignee} size={20} className="shrink-0" />
            ) : null}
            <ReviewWaitStatus waitingOn={waitingOn} />
          </li>
        ))}
      </ul>
      {!isMulti ? <ParentStoryLine ticket={ticket} /> : null}
    </li>
  )
}

/**
 * "under <story>" — shown only when the reviewed ticket is a Sub-task, so
 * a stacked chain like BOUN-11497/8/9 still reads as one story's work
 * without collapsing three genuinely separate reviews into one row.
 */
function ParentStoryLine({ ticket }: { ticket: TicketReviewGroup["ticket"] }) {
  if (!ticket.isSubtask) return null
  return (
    <p className="m-0 flex min-w-0 basis-full items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">under</span>
      <JiraLink
        issueKey={ticket.story.key}
        type="story"
        tone={ticket.story.status}
        className="min-w-0 gap-1"
      >
        {ticket.story.summary}
      </JiraLink>
    </p>
  )
}

function ReviewWaitStatus({ waitingOn }: { waitingOn: { reviewer: string; ageDays: number }[] }) {
  if (waitingOn.length === 0) {
    return (
      <span className="shrink-0 text-xs" style={{ color: "var(--status-in-progress)" }}>
        Needs a reviewer
      </span>
    )
  }

  const oldest = Math.max(...waitingOn.map((w) => w.ageDays))
  return (
    <div className="flex shrink-0 items-center gap-2">
      {waitingOn.map((w) => (
        <PersonChip key={w.reviewer} login={w.reviewer} />
      ))}
      <span
        className="font-mono-data text-xs"
        style={{ color: oldest > 2 ? "var(--status-in-progress)" : "var(--muted-foreground)" }}
      >
        {oldest}d
      </span>
    </div>
  )
}
