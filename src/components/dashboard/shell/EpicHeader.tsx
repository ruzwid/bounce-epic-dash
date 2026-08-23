import { useState } from "react"
import { PanelLeft } from "lucide-react"
import { epicProgress } from "@/lib/dashboard/nav"
import { resolveTargetDate } from "@/lib/dashboard/velocity"
import { buildSlackSummary } from "@/lib/dashboard/slack"
import { WORK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"
import { Button } from "@/components/ui/button"
import { useShell } from "./ShellContext"

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" })
const DAY_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

/**
 * The one piece of chrome that stays put on every page: where the epic
 * stands right now. It leads with the weighted completion figure because
 * that is the number anyone opening this dashboard came for, and pairs it
 * immediately with the shipped/staged/in-review split so the figure can
 * never be read as "40% of the work is live" when half of it is staged.
 */
export function EpicHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { epic, snapshot, previousSummary } = useShell()
  const [copied, setCopied] = useState(false)

  // Falls back to config.yaml's current target for snapshots collected
  // before one was set — see resolveTargetDate.
  const targetDate = resolveTargetDate(snapshot)
  const progress = epicProgress(epic, snapshot.features)
  // Computed in the loader, not here: the only input is the previous
  // snapshot's features, and keeping them around client-side to derive
  // one integer is what made every page carry a second snapshot.
  const delta = previousSummary ? progress.percent - previousSummary.percent : null

  async function copySlackSummary() {
    await navigator.clipboard.writeText(buildSlackSummary(snapshot))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="page-wrap flex flex-wrap items-center gap-x-7 gap-y-3 py-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="nav-item -ml-1 rounded-4xl p-2 lg:hidden"
        >
          <PanelLeft aria-hidden="true" className="size-[18px]" />
        </button>

        {/*
          Three columns, one shared rhythm: every column below is either a
          "big element" (the percent figure, the button) self-centered
          against its neighbour, or a two-line stack — and every stack uses
          the exact same row heights (h-5 headline / h-4 detail) and gap, so
          the headline line and the detail line land on the same baseline
          in every column instead of each block just centering on its own.
        */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display font-mono-data text-[38px] leading-none">
            {progress.percent}
            <span className="pl-1 text-xl text-muted-foreground">%</span>
          </span>
          <div className="flex flex-col gap-1">
            <span className="flex h-5 items-center text-[13px] font-medium whitespace-nowrap">Epic complete</span>
            <DeltaLine delta={delta} />
          </div>
        </div>

        {/* Divider rules borrowed from StatStrip — the same "related
            figures, ruled apart" language, so the header reads as one
            family with the KPI row below it rather than a bespoke strip. */}
        <div className="min-w-60 max-w-md flex-1 border-l border-border-soft pl-7">
          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center">
              <SegmentedProgress progress={progress} />
            </div>
            <div className="flex h-4 flex-wrap items-center gap-x-3.5 text-[11.5px] leading-4 text-muted-foreground">
              <span>
                <span className="font-mono-data">{snapshot.kpis.shipped}</span> shipped
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.doneUnverified}</span> done, unverified
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.staged}</span> staged
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.inReview}</span> in review
              </span>
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-none items-center gap-4 border-l border-border-soft pl-7">
          <div className="hidden flex-col gap-1 text-right text-[11.5px] text-muted-foreground sm:flex">
            <span className="flex h-5 items-center justify-end whitespace-nowrap">
              {targetDate ? `Target ${targetDate}` : "No target date set"}
            </span>
            <span className="font-mono-data flex h-4 items-center justify-end leading-4 whitespace-nowrap">
              Generated {formatGeneratedAt(snapshot.generatedAt)}
            </span>
          </div>
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
    return (
      <span className="flex h-4 items-center text-[11.5px] leading-4 whitespace-nowrap text-muted-foreground">
        First snapshot on record
      </span>
    )
  }
  if (delta === 0) {
    return (
      <span className="flex h-4 items-center text-[11.5px] leading-4 whitespace-nowrap text-muted-foreground">
        No change since last snapshot
      </span>
    )
  }
  return (
    <span
      className="flex h-4 items-center text-[11.5px] leading-4 whitespace-nowrap"
      style={{ color: delta > 0 ? "var(--status-shipped)" : "var(--status-blocked)" }}
    >
      {delta > 0 ? "▲" : "▼"} <span className="ml-1 font-mono-data">{Math.abs(delta)}</span> pts since last snapshot
    </span>
  )
}

const SEGMENTS = [
  { key: "shippedShare", color: "var(--status-shipped)", label: WORK_STATUS_LABELS.shipped },
  { key: "doneUnverifiedShare", color: "var(--status-done-unverified)", label: WORK_STATUS_LABELS.done_unverified },
  { key: "stagedShare", color: "var(--status-staged)", label: WORK_STATUS_LABELS.staged },
  { key: "inReviewShare", color: "var(--status-in-review)", label: WORK_STATUS_LABELS.in_review },
] as const

/** Four stacked segments on one track — shipped, done_unverified, staged,
 *  in review — so the bar shows the *composition* of progress rather than
 *  a single fill that would hide the shipped-vs-staged distinction
 *  entirely. Same
 *  ruler-tick treatment as ScoreBar (0/25/70/100, the real Stage
 *  boundaries) — the epic-level bar and every feature's own bar are
 *  drawn with the one signature device, not two unrelated progress
 *  widgets that happen to sit on the same page. */
function SegmentedProgress({ progress }: { progress: ReturnType<typeof epicProgress> }) {
  return (
    <div
      className="tick-marks relative flex h-2.5 w-full overflow-hidden rounded-md bg-muted"
      role="img"
      aria-label={`${progress.percent}% complete: ${SEGMENTS.map(
        (s) => `${Math.round(progress[s.key])}% ${s.label.toLowerCase()}`,
      ).join(", ")}`}
    >
      {SEGMENTS.map((segment) => (
        <span
          key={segment.key}
          // Width, not the transform ScoreBar animates: these four segments
          // butt against each other on one flex track, so each one's size
          // is what positions the next — there is no single fill to slide.
          // 250ms is the sub-300ms budget for UI motion; this only animates
          // on a change of date or epic.
          className="h-full transition-[width] duration-[250ms] ease-[var(--ease-out)]"
          style={{ width: `${progress[segment.key]}%`, background: segment.color }}
        />
      ))}
    </div>
  )
}

/** "Tue, 11 Aug, 08:02" — the snapshot's own instant, rendered in UTC so
 *  a prerendered page and a browser in any timezone print the same string
 *  (a locale-dependent render would hydrate-mismatch).
 *
 *  The weekday is the page's only mention of which day this snapshot is
 *  from, now that the Today hero leads with the sentence instead of a
 *  date — and "Tuesday" is what people actually navigate by when asking
 *  whether they've already read this one.
 *
 *  Formatted in two passes because en-GB renders the weekday without a
 *  following comma ("Tue 11 Aug"), which reads as a typo next to the
 *  comma before the time. */
function formatGeneratedAt(generatedAt: string): string {
  const date = new Date(generatedAt)
  const weekday = WEEKDAY_FORMATTER.format(date)
  const rest = DAY_TIME_FORMATTER.format(date)
  return `${weekday}, ${rest}`
}
