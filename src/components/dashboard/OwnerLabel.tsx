import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { Avatar } from "./Avatar"
import { useShell } from "./shell/ShellContext"

/**
 * A feature owner, shown as face + name. Unlike PersonChip this has no
 * container of its own — owners appear inside rows and headers that
 * already have a surface, and nesting a chip inside a card just adds a
 * second boundary around the same fact.
 */
export function OwnerLabel({
  name,
  size = 17,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const { epic } = useShell()
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Avatar login={loginForDisplayName(epic, name)} name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  )
}
