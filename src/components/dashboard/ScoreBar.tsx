import { cn } from "@/lib/utils"

type ScoreBarProps = {
  score: number
  /** Whether every subtask has actually shipped to the default branch —
   *  the bar only fills solid "done" green at 100 when this is true; a
   *  feature that hits 100 by weight without full shipment (see
   *  src/lib/score.ts's deriveStage) gets the neutral fill instead. */
  allShippedToDefault: boolean
  className?: string
}

/**
 * Exactly one progress bar per feature card. Ruler ticks at 0/25/70/100 —
 * the real Stage boundaries from deriveStage, not decoration — are the
 * dashboard's one signature element.
 */
export function ScoreBar({ score, allShippedToDefault, className }: ScoreBarProps) {
  const isDone = score === 100 && allShippedToDefault
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="tick-marks relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${score}%`,
            background: isDone ? "var(--status-shipped)" : "var(--foreground)",
            opacity: isDone ? 1 : 0.72,
          }}
        />
      </div>
      <span className="font-mono-data w-10 shrink-0 text-right text-sm font-semibold">{score}%</span>
    </div>
  )
}
