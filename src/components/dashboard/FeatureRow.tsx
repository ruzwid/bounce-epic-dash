import { ChevronRight } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { featureSlug } from "@/lib/dashboard/nav"
import { ShellLink } from "./shell/ShellLink"
import { StatusPill } from "./StatusPill"
import { ScoreBar } from "./ScoreBar"
import { OwnerLabel } from "./OwnerLabel"

type FeatureT = z.infer<typeof FeatureSchema>

/**
 * The feature list is an index, not a summary: every row is a link to the
 * page that holds the detail. It carries only what you need to decide
 * whether to open it — where the work stands, how much of it there is, and
 * how long since anyone touched it.
 */
export function FeatureRow({ feature }: { feature: FeatureT }) {
  const allShipped = feature.stories.length > 0 && feature.stories.every((s) => s.status === "shipped")

  return (
    <li className="list-none">
      <ShellLink
        page="feature"
        code={featureSlug(feature.code)}
        className="surface-card group flex items-center gap-4 rounded-4xl border border-border bg-card px-5 py-3.5 no-underline"
      >
        <span aria-hidden="true" data-status-dot={feature.stage} className="size-2 shrink-0 rounded-full" />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* feature.title already starts with the code ("F1.1 — ..."),
              so there's no separate code label here. */}
          <span className="truncate text-sm font-medium">{feature.title}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <OwnerLabel name={feature.owner} size={16} />
            <span>
              · {feature.stories.length} {feature.stories.length === 1 ? "story" : "stories"} ·{" "}
              {feature.daysSinceLastActivity === null
                ? "activity unknown"
                : `last activity ${feature.daysSinceLastActivity}d ago`}
            </span>
          </span>
        </span>

        <StatusPill status={feature.stage} className="hidden shrink-0 sm:inline-flex" />

        {feature.dataOk ? (
          <ScoreBar score={feature.score} allShippedToDefault={allShipped} className="hidden w-40 shrink-0 md:flex" />
        ) : (
          <span className="hidden w-40 shrink-0 text-xs text-muted-foreground md:block">Data unavailable</span>
        )}

        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
        />
      </ShellLink>
    </li>
  )
}
