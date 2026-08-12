import { featureBySlug } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { EmptyState } from "../EmptyState"
import { FeaturePage } from "./FeaturePage"

/**
 * Resolves a `/f/:code` slug against the snapshot currently in the shell.
 * A slug that was valid yesterday can be absent today — features are read
 * from config on every run — so this renders a real "not in this snapshot"
 * state rather than throwing a route-level notFound, which would replace
 * the whole shell and lose the rail the reader needs to get out.
 */
export function FeatureBySlug({ code }: { code: string }) {
  const { snapshot } = useShell()
  const feature = featureBySlug(snapshot.features, code)

  if (!feature) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display m-0 text-[28px] leading-tight">Feature not found</h1>
        <EmptyState
          message={`No feature matches "${code}" in the ${snapshot.date} snapshot. It may have been added or renamed since.`}
        />
        <ShellLink page="today" className="text-sm">
          Back to Today
        </ShellLink>
      </div>
    )
  }

  return <FeaturePage feature={feature} />
}
