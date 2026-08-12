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

export function PersonChip({ login, name, className }: PersonChipProps) {
  const label = name ?? login ?? "Unknown"

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg bg-muted py-1 pr-2.5 pl-1 text-xs",
        className,
      )}
    >
      <Avatar login={login} name={label} size={19} />
      <span className="truncate">{label}</span>
    </span>
  )
}
