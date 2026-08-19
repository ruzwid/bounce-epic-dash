import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react"
import type { z } from "zod"
import type { PrRef as PrRefSchema } from "@/lib/schema"
import { prTone, type PrTone } from "@/lib/dashboard/prTone"
import { cn } from "@/lib/utils"

type PrRefT = z.infer<typeof PrRefSchema>

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

export function PrChip({
  pr,
  className,
  asSpan,
}: {
  pr: PrRefT
  className?: string
  /** Draw the chip without its own anchor — for a row that is itself one
   *  link to this pull request (see `.row-link`), where a second anchor
   *  nested inside the first isn't valid HTML. The chip still lights up
   *  on row hover, so the thing a reader used to have to hit exactly
   *  still reads as the target. */
  asSpan?: boolean
}) {
  const tone = prTone(pr)
  const Icon = TONE_ICON[tone]
  const target = tone === "staged" ? ` → ${pr.baseRef}` : ""
  const Tag = asSpan ? "span" : "a"

  return (
    <Tag
      {...(asSpan ? {} : ({ href: pr.url, target: "_blank", rel: "noreferrer" } as const))}
      data-pr={tone}
      title={`${pr.title} — ${TONE_DESCRIPTION[tone]}${target}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-4xl px-2.5 py-1 text-xs no-underline",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{pr.repo}</span>
      <span className="font-mono-data pr-number shrink-0">#{pr.number}</span>
      <span className="sr-only"> ({TONE_DESCRIPTION[tone]})</span>
    </Tag>
  )
}
