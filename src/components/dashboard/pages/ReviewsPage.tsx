import { useState } from "react"
import { Copy, ChevronDown, Clock, CircleCheck, CircleX, MessageSquare } from "lucide-react"
import type { ReviewerState, ReviewerStatus, StoryReviewGroup, TicketReviewGroup } from "@/lib/dashboard/nav"
import { featureSlug, reviewsByStory } from "@/lib/dashboard/nav"
import { storyPrs } from "@/lib/stories"
import { loginForJiraAssignee } from "@/lib/dashboard/appConfig"
import {
  buildReviewerSections,
  filterGroupByAuthor,
  filterGroupByReviewer,
  toMarkdown,
  toNotion,
  toSlack,
} from "@/lib/dashboard/reviewExport"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { PrChip } from "../PrChip"
import { PersonChip } from "../PersonChip"
import { Avatar } from "../Avatar"
import { IssueTitle, JiraLink } from "../JiraLink"
import { EmptyState } from "../EmptyState"

const ALL_REVIEWERS = "__all__"
const ALL_AUTHORS = "__all__"

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
  const [reviewer, setReviewer] = useState<string | null>(null)
  const [author, setAuthor] = useState<string | null>(null)

  const reviewers = [...new Set(snapshot.reviewQueue.map((r) => r.reviewer))].sort()
  const allGroups = reviewsByStory(snapshot)
  const authors = [
    ...new Set(
      allGroups.flatMap((g) =>
        g.tickets.flatMap((t) => t.prs.map((p) => p.pr.author).filter((a): a is string => a !== null)),
      ),
    ),
  ].sort()
  let groups = allGroups
  if (reviewer) groups = groups.map((g) => filterGroupByReviewer(g, reviewer)).filter((g): g is StoryReviewGroup => g !== null)
  if (author) groups = groups.map((g) => filterGroupByAuthor(g, author)).filter((g): g is StoryReviewGroup => g !== null)
  const waiting = groups.filter((g) => g.oldestWaitDays !== null)
  const needsReviewer = groups.filter((g) => g.oldestWaitDays === null)
  const tickets = groups.flatMap((g) => g.tickets)
  const openPrCount = tickets.reduce((n, t) => n + t.prs.length, 0)
  const oldest = waiting.length > 0 ? Math.max(...waiting.map((g) => g.oldestWaitDays!)) : null

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
            value: reviewer || author ? waiting.length : snapshot.reviewQueue.length,
            color: waiting.length > 0 ? "var(--status-in-review)" : undefined,
          },
          { label: "Open pull requests", value: openPrCount, sublabel: `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}` },
          {
            label: "Oldest request",
            value: oldest === null ? "—" : `${oldest}d`,
            color: oldest !== null && oldest > 2 ? "var(--status-in-progress)" : undefined,
          },
        ]}
      />

      <ReviewerLoad reviewQueue={snapshot.reviewQueue} selected={reviewer} onSelect={setReviewer} />

      <section className="flex flex-col gap-3">
        <SectionHeading
          note={groups.length > 0 ? "longest-waiting first" : undefined}
          actions={
            reviewers.length > 0 || authors.length > 0 ? (
              <>
                {reviewers.length > 0 ? (
                  <Select
                    items={{ [ALL_REVIEWERS]: "All reviewers", ...Object.fromEntries(reviewers.map((r) => [r, r])) }}
                    value={reviewer ?? ALL_REVIEWERS}
                    onValueChange={(value) => setReviewer(value === ALL_REVIEWERS ? null : (value as string))}
                  >
                    <SelectTrigger size="sm" aria-label="Filter by reviewer">
                      <SelectValue placeholder="All reviewers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_REVIEWERS}>All reviewers</SelectItem>
                      {reviewers.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {authors.length > 0 ? (
                  <Select
                    items={{ [ALL_AUTHORS]: "All authors", ...Object.fromEntries(authors.map((a) => [a, a])) }}
                    value={author ?? ALL_AUTHORS}
                    onValueChange={(value) => setAuthor(value === ALL_AUTHORS ? null : (value as string))}
                  >
                    <SelectTrigger size="sm" aria-label="Filter by author">
                      <SelectValue placeholder="All authors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_AUTHORS}>All authors</SelectItem>
                      {authors.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <CopyMenu allGroups={allGroups} reviewers={reviewers} activeReviewer={reviewer} activeAuthor={author} />
              </>
            ) : undefined
          }
        >
          Open pull requests
        </SectionHeading>
        {groups.length === 0 ? (
          <EmptyState
            message={
              reviewer || author
                ? `Nothing matching ${[reviewer, author].filter(Boolean).join(" · ")} right now.`
                : "No open pull requests in this snapshot."
            }
          />
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

const COPY_FORMATS = [
  { id: "notion", label: "Notion", build: toNotion },
  { id: "markdown", label: "Markdown", build: toMarkdown },
  { id: "slack", label: "Slack", build: toSlack },
] as const

/**
 * Copies the current queue as a per-reviewer checklist — one section per
 * person, each with their tickets (Jira link, title, author) and the PRs
 * nested underneath. Reuses the exact same reviewer-narrowing the page's
 * own filter uses, so copying while filtered to one person exports only
 * that person's section instead of everyone's.
 */
function CopyMenu({
  allGroups,
  reviewers,
  activeReviewer,
  activeAuthor,
}: {
  allGroups: StoryReviewGroup[]
  reviewers: string[]
  activeReviewer: string | null
  activeAuthor: string | null
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(format: (typeof COPY_FORMATS)[number]) {
    const sections = buildReviewerSections(allGroups, reviewers, activeReviewer, activeAuthor)
    const text = sections.length > 0 ? format.build(sections) : "Nothing waiting on a reviewer right now."
    await navigator.clipboard.writeText(text)
    setCopied(format.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Copy aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
            <ChevronDown aria-hidden="true" className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent>
        {COPY_FORMATS.map((format) => (
          <DropdownMenuItem key={format.id} onClick={() => copy(format)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Who's carrying the review queue, at a glance — one bar per reviewer,
 * longest queue first, using the same track/fill shape as a feature's
 * ScoreBar so it reads as the same visual language. Doubles as a filter:
 * clicking a row is the fast path to "show me just Vivek's queue", the
 * same state the dropdown above sets.
 */
function ReviewerLoad({
  reviewQueue,
  selected,
  onSelect,
}: {
  reviewQueue: { reviewer: string }[]
  selected: string | null
  onSelect: (reviewer: string | null) => void
}) {
  const counts = new Map<string, number>()
  for (const request of reviewQueue) counts.set(request.reviewer, (counts.get(request.reviewer) ?? 0) + 1)
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = entries[0]![1]

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note="open review requests per person">Review load</SectionHeading>
      <ul className="surface-card m-0 flex list-none flex-col gap-1 rounded-4xl border border-border bg-card px-3 py-3">
        {entries.map(([login, count]) => {
          const isSelected = selected === login
          return (
            <li key={login}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : login)}
                className="hover-fill flex w-full items-center gap-3 rounded-4xl px-2 py-1.5 text-left"
                style={isSelected ? { background: "color-mix(in oklch, var(--status-in-review) 14%, transparent)" } : undefined}
              >
                <PersonChip login={login} className="w-40 shrink-0" />
                <div className="h-2.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
                  <div
                    className="h-full rounded-[3px]"
                    style={{ width: `${(count / max) * 100}%`, background: "var(--status-in-review)" }}
                  />
                </div>
                <span className="font-mono-data w-6 shrink-0 text-right text-sm font-semibold">{count}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * One story, one or more tickets, always shown the same way — a header
 * naming the story once, with every ticket's PRs nested underneath it.
 * A story with exactly one open ticket and one PR (the common case) still
 * gets the header; the nested list just ends up with one row in it, so a
 * five-PR chain and a single PR read as the same shape.
 */
function ReviewGroupCard({ group }: { group: StoryReviewGroup }) {
  const { story, tickets, feature } = group

  return (
    <li className="surface-card flex flex-col gap-2 rounded-4xl border border-border bg-card px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <JiraLink issueKey={story.key} type="story" tone={story.status} className="gap-1.5 text-[14.5px] font-medium">
          <IssueTitle issueKey={story.key} title={story.summary} />
        </JiraLink>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <ShellLink
            page="feature"
            code={featureSlug(feature.code)}
            className="hover-fill font-mono-data text-xs text-muted-foreground no-underline"
          >
            {feature.code}
          </ShellLink>
          {story.assignee ? (
            <Avatar login={loginForJiraAssignee(story.assignee)} name={story.assignee} size={20} />
          ) : null}
        </div>
      </div>
      <ul className="m-0 ml-1 flex list-none flex-col gap-3 border-l-2 border-border-soft p-0 pl-4">
        {tickets.map(({ ticket, prs }) => (
          <li key={ticket.key} className="flex flex-col gap-2">
            <TicketPrList
              ticket={ticket}
              prs={prs}
              showTicketHeader={ticket.isSubtask || (prs.length > 1 && ticket.key !== story.key)}
              showAssignee={false}
              parentKey={story.key}
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
  parentKey,
}: {
  ticket: TicketReviewGroup["ticket"]
  prs: TicketReviewGroup["prs"]
  showTicketHeader: boolean
  /** False when this ticket is nested under a story card that already
   *  shows an assignee avatar of its own — repeating one per sub-task
   *  would just be noise next to the one that already answers "who". */
  showAssignee?: boolean
  /** The story key already shown in the card header above this row — when
   *  this ticket IS that story (the common single-PR case), repeating its
   *  key on the flat PR row would just duplicate the header a line up. */
  parentKey?: string
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
        {prs.map(({ pr, reviewers }) => (
          <li key={`${pr.repo}#${pr.number}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PrChip pr={pr} />
            {!showTicketHeader && ticket.key !== parentKey ? (
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
            <ReviewerStatusRow reviewers={reviewers} />
          </li>
        ))}
      </ul>
    </>
  )
}

/** requested: still being waited on. approved / changes_requested /
 *  commented: a review has already been submitted — GitHub's own three
 *  outcomes, minus "dismissed" (a stale review this dashboard never
 *  fetches; see PrReview in schema.ts). */
const REVIEWER_STATE_ICON: Record<ReviewerState, typeof Clock> = {
  requested: Clock,
  approved: CircleCheck,
  changes_requested: CircleX,
  commented: MessageSquare,
}

const REVIEWER_STATE_COLOR: Record<ReviewerState, string> = {
  requested: "var(--status-in-review)",
  approved: "var(--status-shipped)",
  changes_requested: "var(--status-blocked)",
  commented: "var(--status-in-progress)",
}

const REVIEWER_STATE_LABEL: Record<ReviewerState, string> = {
  requested: "review requested",
  approved: "approved",
  changes_requested: "changes requested",
  commented: "commented",
}

function ReviewerChip({ status }: { status: ReviewerStatus }) {
  const Icon = REVIEWER_STATE_ICON[status.state]
  return (
    <PersonChip
      login={status.reviewer}
      title={`${status.reviewer} — ${REVIEWER_STATE_LABEL[status.state]}`}
      icon={
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0"
          style={{ color: REVIEWER_STATE_COLOR[status.state] }}
        />
      }
    />
  )
}

function ReviewerStatusRow({ reviewers }: { reviewers: ReviewerStatus[] }) {
  if (reviewers.length === 0) {
    return (
      <span className="shrink-0 text-xs" style={{ color: "var(--status-in-progress)" }}>
        Needs a reviewer
      </span>
    )
  }

  const pending = reviewers.filter((r) => r.state === "requested" && r.ageDays !== null)
  const oldest = pending.length > 0 ? Math.max(...pending.map((r) => r.ageDays!)) : null
  return (
    <div className="flex shrink-0 items-center gap-2">
      {reviewers.map((r) => (
        <ReviewerChip key={r.reviewer} status={r} />
      ))}
      {oldest !== null ? (
        <span
          className="font-mono-data text-xs"
          style={{ color: oldest > 2 ? "var(--status-in-progress)" : "var(--muted-foreground)" }}
        >
          {oldest}d
        </span>
      ) : null}
    </div>
  )
}
