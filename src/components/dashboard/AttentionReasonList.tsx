import { CircleAlert, Clock, GitPullRequestArrow, OctagonX } from "lucide-react"
import type { AttentionReason } from "@/lib/dashboard/nav"
import { cn } from "@/lib/utils"

const REASON_ICON = {
  blocked: OctagonX,
  stalled: Clock,
  review_wait: GitPullRequestArrow,
  callout: CircleAlert,
} as const

const REASON_STATUS: Record<AttentionReason["kind"], string> = {
  blocked: "blocked",
  stalled: "in_progress",
  review_wait: "in_review",
  callout: "in_progress",
}

/**
 * Why something is flagged, one row per reason, each in the hue its own
 * status pill already uses.
 *
 * Shared by the Needs attention page and a person's card on People, so the
 * two can't drift into describing the same flag differently — they call
 * the same attentionReasons() and now draw its answer the same way too.
 */
export function AttentionReasonList({
  reasons,
  className,
  size = "default",
}: {
  reasons: AttentionReason[]
  className?: string
  /** "compact" for reasons nested inside a person's card, where the row is
   *  already two levels deep and the page-level size reads as shouting. */
  size?: "default" | "compact"
}) {
  const compact = size === "compact"

  return (
    <ul className={cn("m-0 flex list-none flex-col gap-1.5 p-0", className)}>
      {reasons.map((reason) => {
        const Icon = REASON_ICON[reason.kind]
        return (
          <li
            key={`${reason.kind}-${reason.detail}`}
            className={cn("flex items-start gap-2.5 leading-relaxed", compact ? "text-xs" : "text-[13.5px]")}
          >
            <span
              aria-hidden="true"
              data-status={REASON_STATUS[reason.kind]}
              className={cn(
                "mt-px flex shrink-0 items-center justify-center rounded-4xl",
                compact ? "size-4" : "size-5",
              )}
            >
              <Icon className={compact ? "size-2.5" : "size-3"} />
            </span>
            <span>{reason.detail}</span>
          </li>
        )
      })}
    </ul>
  )
}
