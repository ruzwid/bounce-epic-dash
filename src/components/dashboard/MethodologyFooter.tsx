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
          branch. <strong className="text-foreground">Done, unverified</strong> means the ticket was moved to Done in
          JIRA, but no PR proves the code reached master; it counts toward progress the same as shipped, since the
          ticket is Done, but is always shown separately so that gap stays visible.{" "}
          <strong className="text-foreground">Staged</strong> means it merged, but into an integration or release
          branch — the code exists, but it isn't live. That label only applies while the ticket is still open in
          JIRA; a Done ticket in the same situation reads as "Done, unverified" instead — see above. None of the
          three are ever summed together.
        </p>
      </div>
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Product review and sign-off</h2>
        <p className="m-0">
          A feature's stage can also read <strong className="text-foreground">Done</strong> because product
          approved it — a separate, feature-level override from the done-unverified case above. Moving a feature
          ticket to <strong className="text-foreground">Product Review</strong> emails its product manager;
          approval sends it straight to Done, rejection sends it back to In Progress. So for epic work, reaching
          Done is the sign-off, and this dashboard reads it from the ticket's own status rather than from the
          retired Product Approval label. That approval outranks story status entirely, so a signed-off feature
          can show Done while some of its stories are still todo, staged, or done-unverified; those cases are
          called out separately on the Needs attention page rather than hidden.
        </p>
      </div>
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Full vs. light tier</h2>
        <p className="m-0">
          Full-tier milestones are tracked in complete detail — every story, every acceptance-criteria bullet.
          Light-tier milestones are tracked with the same fields, condensed, and are what a single owner's
          milestone is normally set to. Which milestone is which is set per epic, on the Config page.
        </p>
      </div>
      <p className="font-mono-data m-0 text-xs">
        Sources: JIRA {snapshot.epic.key} · GitHub · generated {snapshot.generatedAt}
      </p>
    </footer>
  )
}
