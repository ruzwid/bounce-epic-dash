import { Clock, Check, X, MessageSquare } from "lucide-react"
import type { ReviewerState, ReviewerStatus } from "@/lib/dashboard/nav"
import { cn } from "@/lib/utils"
import { PersonChip } from "./PersonChip"
import { BOT_ICONS } from "./Avatar"

/** requested: still being waited on. approved / changes_requested /
 *  commented: a review has already been submitted — GitHub's own three
 *  outcomes, minus "dismissed" (a stale review this dashboard never
 *  fetches; see PrReview in schema.ts). */
const REVIEWER_STATE_ICON: Record<ReviewerState, typeof Clock> = {
  requested: Clock,
  approved: Check,
  changes_requested: X,
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

/** A PersonChip carrying its review-state icon — shared by the Reviews
 *  page and every story card, so a reviewer's state reads the same
 *  wherever a PR shows up.
 *
 *  A bot reviewer skips the name entirely: "copilot-pull-request-reviewer"
 *  and "chatgpt-codex-connector" are long enough to blow out every row
 *  they're in, and the brand mark alone already says who it is. It also
 *  skips PersonChip's own little avatar circle — with no name text to sit
 *  next to, the icon can just fill the same pill the named chips use,
 *  rendered bigger than the 11px it'd get squeezed into inside a 19px
 *  circle. */
export function ReviewerChip({ status, className }: { status: ReviewerStatus; className?: string }) {
  const Icon = REVIEWER_STATE_ICON[status.state]
  const title = `${status.reviewer} — ${REVIEWER_STATE_LABEL[status.state]}`
  const BotIcon = BOT_ICONS[status.reviewer]

  if (BotIcon) {
    return (
      <span
        title={title}
        className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-4xl bg-muted px-2 py-1.5", className)}
      >
        <BotIcon aria-hidden="true" size={16} />
        <Icon aria-hidden="true" className="size-3.5 shrink-0" style={{ color: REVIEWER_STATE_COLOR[status.state] }} />
      </span>
    )
  }

  return (
    <PersonChip
      login={status.reviewer}
      title={title}
      className={className}
      icon={
        <Icon aria-hidden="true" className="size-3.5 shrink-0" style={{ color: REVIEWER_STATE_COLOR[status.state] }} />
      }
    />
  )
}
