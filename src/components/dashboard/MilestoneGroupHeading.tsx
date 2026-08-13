import type { SidebarGroup } from "@/lib/dashboard/nav"
import { ShellLink } from "./shell/ShellLink"

/**
 * One heading, two shapes: a single-milestone group ("M1 · Core...") links
 * as one unit to its one page; the merged M3/M4 group links each id to its
 * own milestone page separately, since "M3 / M4 · Tony" is two tickets —
 * neither has its own sidebar/Today entry otherwise, so this is the only
 * way either page is reachable without typing the URL.
 */
export function MilestoneGroupHeading({ group, className }: { group: SidebarGroup; className?: string }) {
  if (group.milestoneIds.length === 1) {
    return (
      <ShellLink page="milestone" id={group.milestoneIds[0]!.toLowerCase()} className={className}>
        {group.label}
      </ShellLink>
    )
  }

  return (
    <span className={className}>
      {group.milestoneIds.map((id, i) => (
        <span key={id}>
          {i > 0 ? " / " : ""}
          <ShellLink page="milestone" id={id.toLowerCase()} className="no-underline hover:underline">
            {id}
          </ShellLink>
        </span>
      ))}
      {" · "}
      {group.suffix}
    </span>
  )
}
