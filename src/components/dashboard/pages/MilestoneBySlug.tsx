import { milestoneBySlug } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { EmptyState } from "../EmptyState"
import { MilestonePage } from "./MilestonePage"

/**
 * Resolves a `/m/:id` slug against the snapshot currently in the shell.
 * Same reasoning as FeatureBySlug: render a real "not in this snapshot"
 * state rather than a route-level notFound, which would replace the
 * whole shell and lose the rail the reader needs to get out.
 */
export function MilestoneBySlug({ id }: { id: string }) {
  const { snapshot } = useShell()
  const milestone = milestoneBySlug(snapshot, id)

  if (!milestone) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display m-0 text-[28px] leading-tight">Milestone not found</h1>
        <EmptyState
          message={`No milestone matches "${id}" in the ${snapshot.date} snapshot. It may have no features tracked yet.`}
        />
        <ShellLink page="today" className="text-sm">
          Back to Today
        </ShellLink>
      </div>
    )
  }

  return <MilestonePage milestone={milestone} />
}
