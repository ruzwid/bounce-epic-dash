import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type SectionHeadingProps = {
  children: ReactNode
  /** Sits on the baseline beside the heading — a date range, a count, a
   *  one-line qualifier. Never a second heading. */
  note?: ReactNode
  /** Pushed to the far end of the row: filter chips, a link. */
  actions?: ReactNode
  className?: string
}

/** Every section on every page opens with this, so the page rhythm is set
 *  by one component instead of a dozen ad-hoc `<h2>` sizes. */
export function SectionHeading({ children, note, actions, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-2", className)}>
      <h2 className="font-display m-0 text-[19px] leading-tight">{children}</h2>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
