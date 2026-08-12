import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react"
import type { z } from "zod"
import type { PrRef as PrRefSchema } from "@/lib/schema"
import { cn } from "@/lib/utils"

type PrRefT = z.infer<typeof PrRefSchema>

export type PrTone = "shipped" | "staged" | "open" | "draft" | "closed"

/**
 * A merged PR is drawn in two different colours here, and that is the
 * point: green only when it landed on the repo's default branch, gold when
 * it merged into an integration branch instead. GitHub itself shows both
 * as "merged", which is exactly the conflation this dashboard exists to
 * undo — so the icon matches GitHub, and the colour tells the truth.
 */
export function prTone(pr: PrRefT): PrTone {
  if (pr.state === "MERGED") return pr.shippedToDefault ? "shipped" : "staged"
  if (pr.state === "CLOSED") return "closed"
  return pr.isDraft ? "draft" : "open"
}

const TONE_ICON = {
  shipped: GitMerge,
  staged: GitMerge,
  open: GitPullRequest,
  draft: GitPullRequestDraft,
  closed: GitPullRequestClosed,
} as const

const TONE_DESCRIPTION: Record<PrTone, string> = {
  shipped: "merged to the default branch",
  staged: "merged into an integration branch",
  open: "open",
  draft: "draft",
  closed: "closed without merging",
}

export function PrChip({ pr, className }: { pr: PrRefT; className?: string }) {
  const tone = prTone(pr)
  const Icon = TONE_ICON[tone]
  const target = tone === "staged" ? ` → ${pr.baseRef}` : ""

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      data-pr={tone}
      title={`${pr.title} — ${TONE_DESCRIPTION[tone]}${target}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs no-underline",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{pr.repo}</span>
      <span className="font-mono-data pr-number shrink-0">#{pr.number}</span>
      <span className="sr-only"> ({TONE_DESCRIPTION[tone]})</span>
    </a>
  )
}
