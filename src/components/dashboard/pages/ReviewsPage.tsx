import { useState } from "react"
import { Copy, ChevronDown } from "lucide-react"
import type { ReviewerStatus, StoryReviewGroup, TicketReviewGroup } from "@/lib/dashboard/nav"
import { featureSlug, reviewsByStory } from "@/lib/dashboard/nav"
import { storyPrs } from "@/lib/stories"
import { displayNameForLogin, loginForJiraAssignee } from "@/lib/dashboard/appConfig"
import {
  buildReviewerSections,
  filterGroupByAuthor,
  filterGroupByReviewer,
  toMarkdown,
  toNotion,
  toSlack,
} from "@/lib/dashboard/reviewExport"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { FilterMenu } from "../FilterMenu"
import { PrChip } from "../PrChip"
import { ReviewerChip, orderReviewers } from "../ReviewerChip"
import { firstName, PersonTip } from "../PersonTip"
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

      <ReviewerLoad reviewQueue={snapshot.reviewQueue} selected={reviewer} onSelect={setReviewer} />

      <section className="flex flex-col gap-3">
        <SectionHeading
          note={groups.length > 0 ? "longest-waiting first" : undefined}
          actions={
            reviewers.length > 0 || authors.length > 0 ? (
              <>
                {reviewers.length > 0 ? (
                  <FilterMenu
                    label="All reviewers"
                    value={reviewer}
                    options={reviewers}
                    onChange={setReviewer}
                    ariaLabel="Filter by reviewer"
                  />
                ) : null}
                {authors.length > 0 ? (
                  <FilterMenu
                    label="All authors"
                    value={author}
                    options={authors}
                    onChange={setAuthor}
                    ariaLabel="Filter by author"
                  />
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
 * Who's carrying the review queue, at a glance — one tile per reviewer,
 * longest queue first, drawn as the same figure tiles every other page
 * opens with (label and glyph on top, the number beneath). A reviewer's
 * queue length is a headline figure like any other, and giving it the
 * headline shape means a reader arriving from Today already knows how to
 * read it.
 *
 * Unlike those tiles these are buttons: pressing one is the fast path to
 * "show me just Vivek's queue", the same state the dropdown below sets,
 * and pressing it again clears it.
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
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (entries.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading note="open review requests per person · press one to filter">Review load</SectionHeading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map(([login, count]) => {
          const isSelected = selected === login
          return (
            <button
              key={login}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : login)}
              title={isSelected ? "Show every reviewer again" : `Show only ${login}'s queue`}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-4xl px-4 py-3.5 text-left transition-colors duration-150 ease-[var(--ease-out)]",
                isSelected ? "bg-muted" : "bg-muted/60 hover:bg-muted",
              )}
              // The pressed tile is outlined rather than merely tinted: a
              // filter that changes what the rest of the page contains has
              // to be unmistakable, and a second shade of the same grey
              // isn't.
              style={isSelected ? { outline: "1px solid var(--status-in-review)", outlineOffset: "-1px" } : undefined}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="truncate text-xs leading-snug text-muted-foreground">
                  {displayNameForLogin(login) ?? login}
                </span>
                <Avatar login={login} name={displayNameForLogin(login) ?? login} size={18} />
              </span>
              <span className="font-display font-mono-data text-[20px] leading-none">{count}</span>
            </button>
          )
        })}
      </div>
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
            <PersonTip label={firstName(story.assignee)}>
              <Avatar login={loginForJiraAssignee(story.assignee)} name={story.assignee} size={20} />
            </PersonTip>
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
            <PersonTip label={firstName(ticket.assignee)} className="ml-auto shrink-0">
              <Avatar login={loginForJiraAssignee(ticket.assignee)} name={ticket.assignee} size={20} />
            </PersonTip>
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
              <PersonTip label={firstName(ticket.assignee)} className="shrink-0">
                <Avatar login={loginForJiraAssignee(ticket.assignee)} name={ticket.assignee} size={20} />
              </PersonTip>
            ) : null}
            <ReviewerStatusRow reviewers={reviewers} />
          </li>
        ))}
      </ul>
    </>
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
  const ordered = orderReviewers(reviewers)
  return (
    <div className="flex shrink-0 items-center gap-2">
      {ordered.map((r) => (
        <ReviewerChip key={r.reviewer} status={r} avatarOnly />
      ))}
      {oldest !== null ? (
        // "open Nd", not a bare age: this counts from the PR's open date
        // (see ReviewRequest.ageDays), which is a longer, more honest
        // number than the last-touched one it replaced — worth labelling
        // so nobody reads it as "untouched for N days".
        <span
          className="font-mono-data text-xs whitespace-nowrap"
          title="Days this pull request has been open"
          style={{ color: oldest > 2 ? "var(--status-in-progress)" : "var(--muted-foreground)" }}
        >
          open {oldest}d
        </span>
      ) : null}
    </div>
  )
}
