import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

type MethodologyFooterProps = {
  snapshot: StatusSnapshotT
}

/** Fixed methodology copy — doesn't change per snapshot, unlike every
 *  other section on the page. */
export function MethodologyFooter({ snapshot }: MethodologyFooterProps) {
  return (
    <footer className="flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Shipped vs. done-unverified vs. staged</h2>
        <p className="m-0">
          <strong className="text-foreground">Shipped</strong> means a pull request merged into the repo's default
          branch. <strong className="text-foreground">Done, unverified</strong> means JIRA marks the ticket Done —
          product signed off — but no PR proves the code reached master; it counts toward progress the same as
          shipped, since sign-off happened, but is always shown separately so that gap stays visible.{" "}
          <strong className="text-foreground">Staged</strong> means it merged, but into an integration or release
          branch — the code exists, but it isn't live. None of the three are ever summed together.
        </p>
      </div>
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Full vs. light tier</h2>
        <p className="m-0">
          Full-tier milestones (M1) are tracked in complete detail — every story, every acceptance-criteria bullet.
          Light-tier milestones (M3/M4) are tracked with the same fields, condensed, for a single owner.
        </p>
      </div>
      <p className="font-mono-data m-0 text-xs">
        Sources: JIRA {snapshot.epic.key} · GitHub · generated {snapshot.generatedAt}
      </p>
    </footer>
  )
}
