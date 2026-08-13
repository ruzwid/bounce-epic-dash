import type { StoryReviewGroup, TicketReviewGroup } from "@/lib/dashboard/nav"
import { featureSlug, reviewsByStory } from "@/lib/dashboard/nav"
import { storyPrs } from "@/lib/stories"
import { loginForJiraAssignee } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { PrChip } from "../PrChip"
import { PersonChip } from "../PersonChip"
import { Avatar } from "../Avatar"
import { IssueTitle, JiraLink } from "../JiraLink"
import { EmptyState } from "../EmptyState"

/**
 * One card per story, not per pull request or even per ticket: a story
 * whose Sub-tasks each opened their own PRs used to scatter as unrelated
 * cards a reader had to reassemble via a repeated "under <story>" line.
 * Grouping by story and nesting tickets inside is the whole redesign —
 * everything else (oldest-wait-first, then "needs a reviewer") is the
 * same priority order the page always used, just applied to stories.
 */
export function ReviewsPage() {
  const { snapshot } = useShell()

  const groups = reviewsByStory(snapshot)
  const waiting = groups.filter((g) => g.oldestWaitDays !== null)
  const needsReviewer = groups.filter((g) => g.oldestWaitDays === null)
  const tickets = groups.flatMap((g) => g.tickets)
  const openPrCount = tickets.reduce((n, t) => n + t.prs.length, 0)
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
          { label: "Open pull requests", value: openPrCount, sublabel: `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}` },
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
                  <ReviewGroupCard key={group.story.key} group={group} />
                ))}
              </ul>
            ) : null}
            {waiting.length > 0 && needsReviewer.length > 0 ? (
              <p className="eyebrow m-0 px-1 pt-1 font-normal">No reviewer requested yet</p>
            ) : null}
            {needsReviewer.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {needsReviewer.map((group) => (
                  <ReviewGroupCard key={group.story.key} group={group} />
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
 * One story, one or more tickets. A story with exactly one open ticket of
 * work — the common case — reads as one flat card, unchanged from before.
 * A story whose Sub-tasks (or a Sub-task plus the story itself) each have
 * open PRs gets a story header naming it once, with every ticket nested
 * underneath: story -> ticket -> PRs, ticket -> PRs, ... — so a stacked
 * chain like BOUN-11497/8/9 reads as one story's work without repeating
 * "under <story>" on every sibling.
 */
function ReviewGroupCard({ group }: { group: StoryReviewGroup }) {
  const { story, tickets } = group

  if (tickets.length === 1 && !tickets[0]!.ticket.isSubtask) {
    const { ticket, prs } = tickets[0]!
    return (
      <li className="surface-card flex flex-col gap-2 rounded-4xl border border-border bg-card px-5 py-3.5">
        <TicketPrList ticket={ticket} prs={prs} showTicketHeader={prs.length > 1} />
      </li>
    )
  }

  return (
    <li className="surface-card flex flex-col gap-2 rounded-4xl border border-border bg-card px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <JiraLink issueKey={story.key} type="story" tone={story.status} className="gap-1.5 text-[14.5px] font-medium">
          <IssueTitle issueKey={story.key} title={story.summary} />
        </JiraLink>
        {story.assignee ? (
          <Avatar
            login={loginForJiraAssignee(story.assignee)}
            name={story.assignee}
            size={20}
            className="ml-auto shrink-0"
          />
        ) : null}
      </div>
      <ul className="m-0 ml-1 flex list-none flex-col gap-3 border-l-2 border-border-soft p-0 pl-4">
        {tickets.map(({ ticket, prs }) => (
          <li key={ticket.key} className="flex flex-col gap-2">
            <TicketPrList
              ticket={ticket}
              prs={prs}
              showTicketHeader={ticket.isSubtask || prs.length > 1}
              showAssignee={false}
            />
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * A single ticket's PR rows. A one-PR ticket reads as a flat row with the
 * ticket key inline; a multi-PR ticket (or one already getting its own
 * header because it's a Sub-task nested under its story) gets a header
 * naming the ticket once, with its PRs indented under a rule.
 */
function TicketPrList({
  ticket,
  prs,
  showTicketHeader,
  showAssignee = true,
}: {
  ticket: TicketReviewGroup["ticket"]
  prs: TicketReviewGroup["prs"]
  showTicketHeader: boolean
  /** False when this ticket is nested under a story card that already
   *  shows an assignee avatar of its own — repeating one per sub-task
   *  would just be noise next to the one that already answers "who". */
  showAssignee?: boolean
}) {
  return (
    <>
      {showTicketHeader ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <JiraLink
            issueKey={ticket.key}
            {...(ticket.isSubtask ? { type: "subtask" as const } : { type: "story" as const })}
            tone={ticket.status}
            className="gap-1.5 text-[14.5px] font-medium"
          >
            <IssueTitle issueKey={ticket.key} title={ticket.summary} />
          </JiraLink>
          {showAssignee && ticket.assignee ? (
            <Avatar
              login={loginForJiraAssignee(ticket.assignee)}
              name={ticket.assignee}
              size={20}
              className="ml-auto shrink-0"
            />
          ) : null}
        </div>
      ) : null}
      <ul
        className={cn(
          "m-0 flex list-none flex-col gap-2 p-0",
          showTicketHeader && "ml-1 border-l-2 border-border-soft pl-4",
        )}
      >
        {prs.map(({ pr, waitingOn }) => (
          <li key={`${pr.repo}#${pr.number}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PrChip pr={pr} />
            {!showTicketHeader ? (
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
            {!showTicketHeader && showAssignee && ticket.assignee ? (
              <Avatar login={loginForJiraAssignee(ticket.assignee)} name={ticket.assignee} size={20} className="shrink-0" />
            ) : null}
            <ReviewWaitStatus waitingOn={waitingOn} />
          </li>
        ))}
      </ul>
    </>
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
