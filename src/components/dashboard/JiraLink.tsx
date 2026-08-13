import { Blocks, Bug, CircleCheck, FileText, Flag, Layers, ListChecks, type LucideIcon } from "lucide-react"
import { jiraIssueUrl } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"

export type JiraIssueType = "epic" | "milestone" | "feature" | "story" | "task" | "subtask" | "bug"

/** One glyph per real JIRA issue type, so the hierarchy is legible at a
 *  glance before you even read the key:
 *
 *      Epic > Milestone > Feature > Story > Sub-task
 *
 *  `feature` is not in the agreed icon table (which covers the standard
 *  JIRA types) because Feature is this project's own level between a
 *  Milestone and a Story — Blocks reads as "assembled from smaller
 *  parts", which is exactly what it is. */
const ISSUE_TYPE_ICON: Record<JiraIssueType, LucideIcon> = {
  epic: Layers,
  milestone: Flag,
  feature: Blocks,
  story: FileText,
  task: CircleCheck,
  subtask: ListChecks,
  bug: Bug,
}

type JiraLinkProps = {
  /** Ticket key, e.g. "BOUN-11207". */
  issueKey: string
  /** Which icon to draw — see ISSUE_TYPE_ICON above. */
  type: JiraIssueType
  /** Any value valid for data-status-icon/data-status-dot in styles.css —
   *  a Stage or WorkStatus — so the ticket icon reads in the exact hue
   *  its own status pill/dot already uses, rather than a new colour. */
  tone: string
  /** Omit for an icon-only link — used next to a title that's already an
   *  internal ShellLink, where nesting a second full-text anchor inside
   *  it isn't valid HTML (see FeatureRow, AttentionPage). */
  children?: React.ReactNode
  className?: string
  /** Default fits a chip/table row; pass a larger size for a page h1. */
  iconClassName?: string
}

/**
 * The one way a title or ticket ref opens the real Jira issue. Every
 * caller hands this the same three things — a key, an issue type, and a
 * status-ish tone — so an epic, a milestone, a feature, and a story all
 * link out identically instead of one-off anchors accreting slightly
 * different markup.
 *
 * `items-center` (not `items-baseline`) on the parent when placing this
 * next to plain text: an inline-flex element with no baseline-worthy
 * content of its own contributes its bottom margin edge to a
 * baseline-aligned ancestor, not the text baseline of the label inside
 * it, and center-alignment sidesteps that mismatch entirely.
 *
 * Renders the title unlinked (no anchor, no icon) when JIRA_BASE_URL
 * isn't configured, rather than pointing at a guessed host.
 */
export function JiraLink({ issueKey, type, tone, children, className, iconClassName }: JiraLinkProps) {
  const href = jiraIssueUrl(issueKey)
  if (!href) return children ? <>{children}</> : null

  const Icon = ISSUE_TYPE_ICON[type]

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open ${issueKey} in Jira`}
      className={cn(
        "group/jira-link inline-flex min-w-0 items-center gap-1.5 no-underline hover:underline",
        className,
      )}
    >
      <Icon aria-hidden="true" data-status-icon={tone} className={cn("size-3.5 shrink-0", iconClassName)} />
      {children ? <span className="min-w-0 truncate">{children}</span> : <span className="sr-only">{issueKey}</span>}
    </a>
  )
}
