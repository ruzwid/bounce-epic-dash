import type { ReactNode } from "react"
import {
  Package,
  CircleAlert,
  CircleDashed,
  ClipboardCheck,
  Clock,
  FileText,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Hourglass,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  value: ReactNode
  /** A --status-* var, when the number means something on its own (red for
   *  blocked, green for shipped). Left unset for counts that are merely
   *  counts — most of them. */
  color?: string
  sublabel?: string
}

/**
 * One glyph per stat, keyed by label so every page that renders a strip
 * gets the same icon for the same fact without passing it in. Deliberately
 * the same glyphs the rest of the interface uses for these ideas: GitMerge
 * for work that landed, GitPullRequest for work under review.
 */
const STAT_ICONS: Record<string, LucideIcon> = {
  "Features tracked": Package,
  "Stories tracked": FileText,
  "Shipped to master": GitMerge,
  "Done, unverified": CircleAlert,
  "Staged, not shipped": GitBranch,
  "Stories in review": GitPullRequest,
  "Blocked or to do": CircleDashed,
  "Since last activity": Clock,
  "Oldest staged work": Hourglass,
  "Acceptance criteria covered": ClipboardCheck,
  "PRs open": GitPullRequest,
}

/**
 * A row of cards, one figure each: label and glyph on top, the number
 * beneath it.
 *
 * The colour sits on the glyph rather than the number. Every figure here
 * is legible as a plain count, and painting seven numbers in seven hues
 * made the row read as an alert panel — "17 blocked or to do" in red when
 * none of the seventeen were actually blocked. The glyph carries the same
 * information without shouting it.
 */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl className={cn("m-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {stats.map((stat) => {
        const Icon = STAT_ICONS[stat.label]
        return (
          <div key={stat.label} className="flex flex-col gap-2 rounded-4xl bg-muted/60 px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <dt className="text-xs leading-snug text-muted-foreground">
                {stat.label}
                {stat.sublabel ? <span className="opacity-70"> · {stat.sublabel}</span> : null}
              </dt>
              {Icon ? (
                <Icon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                  style={stat.color ? { color: stat.color } : undefined}
                />
              ) : null}
            </div>
            <dd className="font-display font-mono-data m-0 text-[26px] leading-none">{stat.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}
