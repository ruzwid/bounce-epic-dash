import type { ReactNode } from "react"
import { colorForLogin } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { Avatar } from "./Avatar"
import { firstName, PersonTip } from "./PersonTip"

type PersonChipProps = {
  /** GitHub login, when known. Review requests are logins already; an
   *  owner's login comes from the config.yaml people map. */
  login: string | null
  /** What to show beside the avatar. Falls back to the login. */
  name?: string
  /** Trailing glyph — e.g. the Reviews page's review-state icon. Colored
   *  by the caller; this component only places it. */
  icon?: ReactNode
  /** Tooltip for the whole pill, e.g. "Tomer — approved". Native `title`
   *  on a named chip, a real hover card on a nameless one. */
  title?: string
  /** Drop the name and keep the avatar — for rows that carry several
   *  people at once (a PR's reviewers), where five spelled-out logins is
   *  a paragraph and five faces is a glance. The face then has to answer
   *  "who?" on hover, so this variant gets a PersonTip rather than a
   *  browser tooltip. */
  hideName?: boolean
  className?: string
}

/**
 * The pill's background is a sliver of the person's own avatar colour —
 * config.yaml's `peopleColors` (precomputed, see scripts/avatar-colors.ts),
 * mixed into --card the same way status pills mix in --status-color. That
 * keeps it theme-correct for free and reads as decoration, not a colour
 * key the reader has to learn. Falls back to the flat `bg-muted` any other
 * chip uses when the login has no known colour.
 */
export function PersonChip({ login, name, icon, title, hideName, className }: PersonChipProps) {
  const label = name ?? login ?? "Unknown"
  const color = login ? colorForLogin(login) : null

  const chip = (
    <span
      title={hideName ? undefined : title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-4xl py-1 pl-1 text-xs",
        hideName ? "pr-1.5" : "pr-2",
        !color && "bg-muted",
        className,
      )}
      style={color ? { background: `color-mix(in oklch, ${color} 14%, var(--card))` } : undefined}
    >
      <Avatar login={login} name={label} size={19} />
      {hideName ? null : <span className="truncate">{label}</span>}
      {icon}
    </span>
  )

  // PersonTip carries the sr-only name for the nameless variant, so the
  // chip itself doesn't repeat it.
  return hideName ? <PersonTip label={title ?? firstName(label)}>{chip}</PersonTip> : chip
}
