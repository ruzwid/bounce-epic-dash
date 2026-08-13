import type { ReactNode } from "react"
import type { ChangeItem } from "@/lib/dashboard/diff"
import { PrChip } from "./PrChip"

type ChangeFeedItemProps = {
  change: ChangeItem
}

/**
 * One row in the since-last-snapshot feed. The dot carries the status hue,
 * the headline says what happened in four words, and the sub-line carries
 * the attribution — feature, owner, and the score move it caused. Rows,
 * not cards: these are a chronology, and boxing each one would break the
 * list into unrelated fragments.
 */
export function ChangeFeedItem({ change }: ChangeFeedItemProps) {
  switch (change.kind) {
    case "shipped":
      return (
        <Row
          status="shipped"
          headline="Shipped to master"
          trailing={<Delta value={change.scoreDelta} color="var(--status-shipped)" />}
          detail={
            <>
              <PrChip pr={change.pr} className="align-middle" /> merged into{" "}
              <code className="rounded-sm bg-muted px-1.5 py-0.5">{change.pr.baseRef}</code>.
            </>
          }
          attribution={`${change.feature.code} · ${change.story.key} · ${change.feature.owner}`}
        />
      )
    case "newly_staged":
      return (
        <Row
          status="staged"
          headline="Moved to staged"
          detail={
            <>
              <span className="font-mono-data">{change.story.key}</span> merged into{" "}
              <code className="rounded-sm bg-muted px-1.5 py-0.5">{change.integrationBranch}</code>, not master.
            </>
          }
          attribution={`${change.feature.code} · ${change.feature.owner}`}
        />
      )
    case "newly_blocked":
      return (
        <Row
          status="blocked"
          headline="Newly blocked"
          detail={
            <>
              <span className="font-mono-data">{change.story.key}</span> — {change.story.summary}
            </>
          }
          attribution={`${change.feature.code} · ${change.feature.owner}`}
        />
      )
    case "newly_stalled":
      return (
        <Row
          status="blocked"
          headline="Newly stalled"
          trailing={<span className="font-mono-data text-xs text-muted-foreground">{change.daysSinceLastActivity}d</span>}
          detail={<>{change.feature.code} crossed the stall threshold with no commit.</>}
          attribution={change.feature.owner}
        />
      )
  }
}

type RowProps = {
  status: string
  headline: string
  detail: ReactNode
  attribution: string
  trailing?: ReactNode
}

function Row({ status, headline, detail, attribution, trailing }: RowProps) {
  return (
    <li className="flex list-none items-start gap-3.5 border-b border-border-soft px-5 py-4 last:border-b-0">
      <span aria-hidden="true" data-status-dot={status} className="mt-[7px] size-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="font-semibold">{headline}</span> — {detail}
        <div className="mt-0.5 text-xs text-muted-foreground">{attribution}</div>
      </div>
      {trailing ? <span className="mt-0.5 shrink-0">{trailing}</span> : null}
    </li>
  )
}

function Delta({ value, color }: { value: number; color: string }) {
  if (value === 0) return <span className="font-mono-data text-xs text-muted-foreground">=</span>
  return (
    <span className="font-mono-data text-xs" style={{ color }}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value)}
    </span>
  )
}
