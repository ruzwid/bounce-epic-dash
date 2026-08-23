import { cn } from "@/lib/utils"

type ScoreBarProps = {
  score: number
  /** Whether every story has actually shipped to the default branch —
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
        className="tick-marks relative h-2.5 flex-1 overflow-hidden rounded-[3px] bg-muted"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* A full-width fill slid left by the remainder, rather than a fill
            sized to the score. It reads the same — the track clips
            everything left of the frame — but the bar only ever moves when
            the score does (a different snapshot date, or switching epic,
            with these rows still mounted), and animating `width` there is a
            layout, paint and composite pass per frame on every feature row
            at once, where a transform is none of the three.

            Translate specifically, not scaleX: a percentage translate is
            relative to the element's own width, so -40% lands the leading
            edge at exactly 60% of the track, and the 3px radius on that
            edge travels undistorted. Scaling would stretch the same corner
            into an ellipse and force the cap to be dropped.

            250ms, inside the sub-300ms budget UI motion gets. */}
        <div
          className="h-full w-full rounded-[3px] transition-transform duration-[250ms] ease-[var(--ease-out)]"
          style={{
            transform: `translateX(-${100 - Math.min(100, Math.max(0, score))}%)`,
            background: isDone ? "var(--status-shipped)" : "var(--foreground)",
            opacity: isDone ? 1 : 0.72,
          }}
        />
      </div>
      <span className="font-mono-data w-10 shrink-0 text-right text-sm font-semibold">{score}%</span>
    </div>
  )
}
