import { ChevronRight } from "lucide-react"
import type { z } from "zod"
import type { Story as StorySchema, Subtask as SubtaskSchema } from "@/lib/schema"
import { storyPrs } from "@/lib/stories"
import { StatusPill } from "./StatusPill"
import { PrChip } from "./PrChip"
import { PersonChip } from "./PersonChip"
import { JiraLink } from "./JiraLink"

type StoryT = z.infer<typeof StorySchema>
type SubtaskT = z.infer<typeof SubtaskSchema>

/** Reviewers GitHub is still waiting on, across every open PR under this
 *  story — its own and its sub-tasks'. Deduplicated: the same person
 *  requested on three PRs of one story is one person waiting, not three. */
function pendingReviewers(story: StoryT): string[] {
  return [...new Set(storyPrs(story).filter((pr) => pr.state === "OPEN").flatMap((pr) => pr.reviewRequests))]
}

/**
 * One story, one card: ticket, summary, status, and the PRs that back the
 * status claim. The PR row is the evidence — a story reading "Shipped"
 * with no chip beside it is visibly unsupported, which is the whole reason
 * the PRs are on the card rather than behind a toggle.
 *
 * Sub-tasks sit behind a disclosure instead, closed by default. They are
 * implementation breakdown, not the unit of work being reported on (see
 * schema.ts on why they are deliberately not scored), so the default view
 * stays exactly as dense as it was before they were collected at all —
 * but their own PRs are right there when you open it, which is where a
 * good deal of this epic's review activity actually lives.
 */
export function StoryCard({ story }: { story: StoryT }) {
  const reviewers = pendingReviewers(story)
  const needsReviewer = story.status === "in_review" && reviewers.length === 0

  return (
    <li className="surface-card flex list-none flex-col gap-2.5 rounded-4xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <JiraLink
            issueKey={story.key}
            type="story"
            tone={story.status}
            className="font-mono-data gap-1 text-xs text-muted-foreground"
          >
            {story.key}
          </JiraLink>
          <span className="text-[14.5px] font-medium">{story.summary}</span>
        </div>
        <StatusPill status={story.status} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        {story.prs.length === 0 ? (
          <span className="flex-1 text-xs text-muted-foreground">
            {story.subtasks.length > 0 ? "No PR on the story itself" : "No branch or PR yet"}
          </span>
        ) : (
          <ul className="m-0 flex flex-1 list-none flex-wrap gap-2 p-0">
            {story.prs.map((pr) => (
              <li key={`${pr.repo}#${pr.number}`} className="flex min-w-0">
                <PrChip pr={pr} />
              </li>
            ))}
          </ul>
        )}

        {reviewers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Waiting on
            {reviewers.map((reviewer) => (
              <PersonChip key={reviewer} login={reviewer} />
            ))}
          </div>
        ) : needsReviewer ? (
          <span className="text-xs" style={{ color: "var(--status-in-progress)" }}>
            Needs a reviewer
          </span>
        ) : null}
      </div>

      {story.subtasks.length > 0 ? <SubtaskDisclosure subtasks={story.subtasks} /> : null}
    </li>
  )
}

function SubtaskDisclosure({ subtasks }: { subtasks: SubtaskT[] }) {
  const shipped = subtasks.filter((s) => s.status === "shipped").length

  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90"
        />
        {subtasks.length} sub-task{subtasks.length === 1 ? "" : "s"}
        <span className="font-mono-data opacity-70">
          · {shipped}/{subtasks.length} shipped
        </span>
      </summary>
      <ul className="m-0 mt-2 ml-1.5 flex list-none flex-col gap-2 border-l-2 border-border-soft p-0 pl-4">
        {subtasks.map((subtask) => (
          <li key={subtask.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <JiraLink
              issueKey={subtask.key}
              type="subtask"
              tone={subtask.status}
              className="font-mono-data shrink-0 gap-1 text-xs text-muted-foreground"
            >
              {subtask.key}
            </JiraLink>
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{subtask.summary}</span>
            {subtask.prs.map((pr) => (
              <PrChip key={`${pr.repo}#${pr.number}`} pr={pr} />
            ))}
            <StatusPill status={subtask.status} className="shrink-0" />
          </li>
        ))}
      </ul>
    </details>
  )
}
