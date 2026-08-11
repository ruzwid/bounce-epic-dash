import { cn } from "@/lib/utils"
import type { z } from "zod"
import type { Callout as CalloutSchema } from "@/lib/schema"

type CalloutT = z.infer<typeof CalloutSchema>

const SEVERITY_COLOR: Record<CalloutT["severity"], string> = {
  info: "var(--muted-foreground)",
  warn: "var(--status-in-progress)",
  risk: "var(--status-blocked)",
}

const TYPE_LABEL: Record<CalloutT["type"], string> = {
  drift: "Drift",
  spec_gap: "Spec gap",
  release_blocked: "Release blocked",
  stalled: "Stalled",
}

type CalloutProps = {
  callout: CalloutT
  className?: string
}

/** One feature callout — severity conveyed by the left border color AND
 *  the type label text, never color alone. */
export function Callout({ callout, className }: CalloutProps) {
  return (
    <div
      className={cn("border-l-2 py-1.5 pl-3 text-sm", className)}
      style={{ borderColor: SEVERITY_COLOR[callout.severity] }}
    >
      <span className="mr-1.5 font-medium">{TYPE_LABEL[callout.type]}:</span>
      <span className="text-muted-foreground">{callout.message}</span>
      {callout.refs.length > 0 ? (
        <span className="font-mono-data ml-1.5 text-xs text-muted-foreground/80">
          ({callout.refs.join(", ")})
        </span>
      ) : null}
    </div>
  )
}
