import { cn } from "@/lib/utils"
import { statusLabel, type PillStatus } from "@/lib/dashboard/statusLabels"

type StatusPillProps = {
  status: PillStatus
  /** Override the default humanized label — used sparingly, e.g. to add a count. */
  label?: string
  className?: string
}

/**
 * The one status-indicator component used everywhere a WorkStatus or
 * Stage needs to be shown. Color (via `data-status`, see styles.css) is
 * always paired with a text label — never color alone.
 */
export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-4xl px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <span aria-hidden="true" className="status-dot size-1.5 rounded-full" />
      {label ?? statusLabel(status)}
    </span>
  )
}
