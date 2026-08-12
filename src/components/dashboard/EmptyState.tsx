import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
  message: string
  icon?: ReactNode
  className?: string
}

/**
 * The one "nothing here" treatment, reused everywhere the schema can be
 * legitimately empty: no changes since last snapshot, no callouts on a
 * feature, no burn-up history yet, no review queue. Never styled as an
 * error — absence of bad news is good news, and absence of history is
 * just early.
 */
export function EmptyState({ message, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      {icon}
      <span>{message}</span>
    </div>
  )
}
