import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** The first word of a name — "Ruzzell Widjaja" -> "Ruzzell". A login with
 *  no config.yaml entry ("Madjda", "chatgpt-codex-connector") has no first
 *  name to take, so it passes through whole. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/**
 * A hover label for a face with no name beside it.
 *
 * Once a badge is down to a profile picture, the picture is the only thing
 * identifying the person — fine at a glance for the four people you work
 * with every day, useless for the fifth, and invisible to a screen reader.
 * This gives every nameless avatar the same real tooltip (not the browser's
 * half-second `title` popup, which can't be styled and never appears on
 * touch) plus an sr-only name underneath it.
 */
export function PersonTip({
  label,
  children,
  className,
}: {
  /** What to show on hover — a first name, optionally with state
   *  ("Tomer — approved"). */
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={cn("inline-flex", className)}>
            {children}
            <span className="sr-only">{label}</span>
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
