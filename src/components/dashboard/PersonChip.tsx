import { colorForLogin } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { Avatar } from "./Avatar"

type PersonChipProps = {
  /** GitHub login, when known. Review requests are logins already; an
   *  owner's login comes from the config.yaml people map. */
  login: string | null
  /** What to show beside the avatar. Falls back to the login. */
  name?: string
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
export function PersonChip({ login, name, className }: PersonChipProps) {
  const label = name ?? login ?? "Unknown"
  const color = login ? colorForLogin(login) : null

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-4xl py-1 pr-2.5 pl-1 text-xs",
        !color && "bg-muted",
        className,
      )}
      style={color ? { background: `color-mix(in oklch, ${color} 14%, var(--card))` } : undefined}
    >
      <Avatar login={login} name={label} size={19} />
      <span className="truncate">{label}</span>
    </span>
  )
}
