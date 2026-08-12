import type { z } from "zod"
import type { Subtask as SubtaskSchema } from "@/lib/schema"
import { StatusPill } from "./StatusPill"
import { PrChip } from "./PrChip"
import { PersonChip } from "./PersonChip"

type SubtaskT = z.infer<typeof SubtaskSchema>

/** Reviewers GitHub is still waiting on, across this subtask's open PRs.
 *  Deduplicated — the same person requested on three PRs of one subtask is
 *  one person waiting, not three. */
function pendingReviewers(subtask: SubtaskT): string[] {
  return [...new Set(subtask.prs.filter((pr) => pr.state === "OPEN").flatMap((pr) => pr.reviewRequests))]
}

/**
 * One subtask, one card: ticket, summary, status, and the PRs that back
 * the status claim. The PR row is the evidence — a subtask reading
 * "Shipped" with no green chip beside it is visibly unsupported, which is
 * the whole reason the PRs are on the card rather than behind a toggle.
 */
export function SubtaskCard({ subtask }: { subtask: SubtaskT }) {
  const reviewers = pendingReviewers(subtask)
  const needsReviewer = subtask.status === "in_review" && reviewers.length === 0

  return (
    <li className="surface-card flex list-none flex-col gap-2.5 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono-data text-xs text-muted-foreground">{subtask.key}</span>
          <span className="text-[14.5px] font-medium">{subtask.summary}</span>
        </div>
        <StatusPill status={subtask.status} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        {subtask.prs.length === 0 ? (
          <span className="flex-1 text-xs text-muted-foreground">No branch or PR yet</span>
        ) : (
          <ul className="m-0 flex flex-1 list-none flex-wrap gap-2 p-0">
            {subtask.prs.map((pr) => (
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
    </li>
  )
}
