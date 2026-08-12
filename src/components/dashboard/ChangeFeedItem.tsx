import type { ChangeItem } from "@/lib/dashboard/diff"
import { StatusPill } from "./StatusPill"

type ChangeFeedItemProps = {
  change: ChangeItem
}

/** One visual per since-last-snapshot change kind — what shipped, which
 *  PR, whose feature, the score delta, matching the information density
 *  the goal asks for without copying the reference mockup's styling. */
export function ChangeFeedItem({ change }: ChangeFeedItemProps) {
  switch (change.kind) {
    case "shipped":
      return (
        <div className="flex flex-col gap-1 surface rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <StatusPill status="shipped" label="Shipped to master" />
            <span className="font-mono-data text-xs text-muted-foreground">▲ {change.scoreDelta} pts</span>
          </div>
          <p className="m-0 text-sm">
            <a href={change.pr.url} target="_blank" rel="noreferrer" className="font-mono-data underline">
              {change.pr.repo}#{change.pr.number}
            </a>{" "}
            merged into <span className="font-mono-data">{change.pr.baseRef}</span>.
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {change.feature.code} · {change.subtask.key} · {change.feature.owner}
          </p>
        </div>
      )
    case "newly_staged":
      return (
        <div className="flex flex-col gap-1 surface rounded-xl border border-border bg-card p-3">
          <StatusPill status="staged" label="Moved to staged" />
          <p className="m-0 text-sm">
            {change.subtask.key} merged into{" "}
            <span className="font-mono-data">{change.integrationBranch}</span>, not master.
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {change.feature.code} · {change.feature.owner}
          </p>
        </div>
      )
    case "newly_blocked":
      return (
        <div className="flex flex-col gap-1 surface rounded-xl border border-border bg-card p-3">
          <StatusPill status="blocked" label="Newly blocked" />
          <p className="m-0 text-sm">{change.subtask.key} — {change.subtask.summary}</p>
          <p className="m-0 text-xs text-muted-foreground">
            {change.feature.code} · {change.feature.owner}
          </p>
        </div>
      )
    case "newly_stalled":
      return (
        <div className="flex flex-col gap-1 surface rounded-xl border border-border bg-card p-3">
          <StatusPill status="blocked" label="Newly stalled" />
          <p className="m-0 text-sm">
            {change.feature.code} crossed <span className="font-mono-data">{change.daysSinceLastActivity}</span> days
            with no activity.
          </p>
          <p className="m-0 text-xs text-muted-foreground">{change.feature.owner}</p>
        </div>
      )
  }
}
