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
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Shipped vs. staged</h2>
        <p className="m-0">
          <strong className="text-foreground">Shipped</strong> means a pull request merged into the repo's default
          branch. <strong className="text-foreground">Staged</strong> means it merged, but into an integration or
          release branch — the code exists, but it isn't live. A staged subtask is never counted as shipped, and the
          two are never summed together.
        </p>
      </div>
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Full vs. light tier</h2>
        <p className="m-0">
          Full-tier milestones (M1) are tracked in complete detail — every subtask, every acceptance-criteria bullet.
          Light-tier milestones (M3/M4) are tracked with the same fields, condensed, for a single owner.
        </p>
      </div>
      <p className="font-mono-data m-0 text-xs">
        Sources: JIRA {snapshot.epic.key} · GitHub · generated {snapshot.generatedAt}
      </p>
    </footer>
  )
}
