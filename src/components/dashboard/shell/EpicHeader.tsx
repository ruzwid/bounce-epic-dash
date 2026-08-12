import { useState } from "react"
import { PanelLeft } from "lucide-react"
import { epicProgress } from "@/lib/dashboard/nav"
import { buildSlackSummary } from "@/lib/dashboard/slack"
import { SUBTASK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"
import { Button } from "@/components/ui/button"
import { useShell } from "./ShellContext"

/**
 * The one piece of chrome that stays put on every page: where the epic
 * stands right now. It leads with the weighted completion figure because
 * that is the number anyone opening this dashboard came for, and pairs it
 * immediately with the shipped/staged/in-review split so the figure can
 * never be read as "40% of the work is live" when half of it is staged.
 */
export function EpicHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { snapshot, previous } = useShell()
  const [copied, setCopied] = useState(false)

  const progress = epicProgress(snapshot.kpis)
  const previousPercent = previous ? epicProgress(previous.kpis).percent : null
  const delta = previousPercent === null ? null : progress.percent - previousPercent

  async function copySlackSummary() {
    await navigator.clipboard.writeText(buildSlackSummary(snapshot))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="page-wrap flex flex-wrap items-center gap-x-7 gap-y-4 py-3.5">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="nav-item -ml-1 rounded-lg p-2 lg:hidden"
        >
          <PanelLeft aria-hidden="true" className="size-[18px]" />
        </button>

        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display font-mono-data text-[38px] leading-none">
            {progress.percent}
            <span className="text-xl text-muted-foreground">%</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium whitespace-nowrap">Epic complete</span>
            <DeltaLine delta={delta} />
          </span>
        </div>

        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <SegmentedProgress progress={progress} />
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              <span className="font-mono-data">{snapshot.kpis.shipped}</span> shipped
            </span>
            <span>
              <span className="font-mono-data">{snapshot.kpis.staged}</span> staged
            </span>
            <span>
              <span className="font-mono-data">{snapshot.kpis.inReview}</span> in review
            </span>
            <span className="sm:ml-auto">
              {snapshot.epic.targetDate ? `target ${snapshot.epic.targetDate}` : "no target date set"}
            </span>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2.5">
          <span className="hidden text-right text-[11px] leading-tight text-muted-foreground sm:block">
            Generated
            <br />
            <span className="font-mono-data">{formatGeneratedAt(snapshot.generatedAt)}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={copySlackSummary}>
            {copied ? "Copied" : "Copy Slack summary"}
          </Button>
        </div>
      </div>
    </header>
  )
}

function DeltaLine({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">First snapshot on record</span>
  }
  if (delta === 0) {
    return <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">No change since last snapshot</span>
  }
  return (
    <span
      className="text-[11.5px] whitespace-nowrap"
      style={{ color: delta > 0 ? "var(--status-shipped)" : "var(--status-blocked)" }}
    >
      {delta > 0 ? "▲" : "▼"} <span className="font-mono-data">{Math.abs(delta)}</span> pts since last snapshot
    </span>
  )
}

const SEGMENTS = [
  { key: "shippedShare", color: "var(--status-shipped)", label: SUBTASK_STATUS_LABELS.shipped },
  { key: "stagedShare", color: "var(--status-staged)", label: SUBTASK_STATUS_LABELS.staged },
  { key: "inReviewShare", color: "var(--status-in-review)", label: SUBTASK_STATUS_LABELS.in_review },
] as const

/** Three stacked segments on one track — shipped, staged, in review — so
 *  the bar shows the *composition* of progress rather than a single fill
 *  that would hide the shipped-vs-staged distinction entirely. */
function SegmentedProgress({ progress }: { progress: ReturnType<typeof epicProgress> }) {
  return (
    <div
      className="flex h-[7px] overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${progress.percent}% complete: ${SEGMENTS.map(
        (s) => `${Math.round(progress[s.key])}% ${s.label.toLowerCase()}`,
      ).join(", ")}`}
    >
      {SEGMENTS.map((segment) => (
        <span
          key={segment.key}
          className="h-full transition-[width] duration-500 ease-[var(--ease-out)]"
          style={{ width: `${progress[segment.key]}%`, background: segment.color }}
        />
      ))}
    </div>
  )
}

/** "11 Aug, 08:02" — the snapshot's own instant, rendered in UTC so a
 *  prerendered page and a browser in any timezone print the same string
 *  (a locale-dependent render would hydrate-mismatch). */
function formatGeneratedAt(generatedAt: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(generatedAt))
}
