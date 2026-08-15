import {
  BadgeCheck,
  Package,
  CircleAlert,
  FileText,
  GitPullRequest,
  Hourglass,
  TrendingDown,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import type { ChangeItem } from "@/lib/dashboard/diff"
import { buildHeroSummary, type HeroClause, type HeroIcon } from "@/lib/dashboard/hero"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

type HeroProps = {
  snapshot: StatusSnapshotT
  changes: ChangeItem[]
  /** Names the gap the movement clauses cover ("since yesterday"), or
   *  null on the first snapshot on record. */
  sinceLabel: string | null
}

/**
 * One glyph per kind of clause. `story` and `feature` are the same two
 * marks JiraLink draws for those issue types, so a sentence counting
 * stories uses the glyph the reader has already learned means "story" —
 * not GitMerge, which is about a pull request, a different noun.
 */
const CLAUSE_ICONS: Record<HeroIcon, LucideIcon> = {
  story: FileText,
  feature: Package,
  approved: BadgeCheck,
  with_product: UserRoundCheck,
  unproven: CircleAlert,
  backwards: TrendingDown,
  stalled: Hourglass,
  review: GitPullRequest,
}

/** "in_review" -> "var(--status-in-review)", plus the one hue that isn't
 *  part of the status family: "pr_shipped" is the purple that means the
 *  code is on master (see styles.css). */
function statusColor(status: string): string {
  if (status === "pr_shipped") return "var(--pr-shipped)"
  return `var(--status-${status.replace(/_/g, "-")})`
}

/**
 * The page's opening: what moved, and what is waiting on someone — as a
 * sentence, not a grid.
 *
 * Colour marks what is being counted, and stops there: the icon, the
 * number and the noun take the status hue, while the verb and any time
 * phrase stay in body colour. It reads as a sentence you can also scan.
 */
export function Hero({ snapshot, changes, sinceLabel }: HeroProps) {
  const summary = buildHeroSummary(snapshot, changes)

  return (
    <p className="font-display m-0 max-w-[40ch] text-[28px] leading-[1.4] sm:text-[34px]">
      <Clauses clauses={summary.movement} suffix={sinceLabel} empty="Nothing moved" />{" "}
      <Clauses clauses={summary.standing} suffix={null} empty="Nothing is waiting on anyone" />
    </p>
  )
}

/**
 * Renders "▤ 2 stories shipped, ⚠ 7 stories marked Done without a PR and
 * ⧗ 2 features stalled since yesterday." — commas between, "and" before
 * the last, full stop at the end.
 */
function Clauses({
  clauses,
  suffix,
  empty,
}: {
  clauses: HeroClause[]
  suffix: string | null
  empty: string
}) {
  if (clauses.length === 0) {
    return <span>{suffix ? `${empty} ${suffix}.` : `${empty}.`}</span>
  }

  return (
    <span>
      {clauses.map((clause, i) => {
        const Icon = CLAUSE_ICONS[clause.icon]
        return (
          <span key={`${clause.noun}-${clause.tail}`}>
            {i > 0 ? (i === clauses.length - 1 ? " and " : ", ") : ""}
            <span className="whitespace-nowrap" style={{ color: statusColor(clause.status) }}>
              <Icon
                aria-hidden="true"
                strokeWidth={2}
                className="mr-1.5 inline-block size-[0.68em] shrink-0 translate-y-[-0.08em]"
              />
              <span className="font-mono-data">{clause.count}</span> {clause.noun}
            </span>{" "}
            {clause.tail}
          </span>
        )
      })}
      {suffix ? ` ${suffix}` : ""}.
    </span>
  )
}
