import { CircleAlert, Clock, GitPullRequestArrow, OctagonX } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { attentionFeatures, attentionReasons, featureSlug, type AttentionReason } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatusPill } from "../StatusPill"
import { OwnerLabel } from "../OwnerLabel"
import { EmptyState } from "../EmptyState"

type FeatureT = z.infer<typeof FeatureSchema>

const REASON_ICON = {
  blocked: OctagonX,
  stalled: Clock,
  review_wait: GitPullRequestArrow,
  callout: CircleAlert,
} as const

const REASON_STATUS: Record<AttentionReason["kind"], string> = {
  blocked: "blocked",
  stalled: "in_progress",
  review_wait: "in_review",
  callout: "in_progress",
}

/**
 * Everything the "needs attention" rule caught, with the reason spelled
 * out on every row. A queue that only says *that* something is wrong makes
 * the reader open all of them; saying *what* is wrong lets them open one.
 */
export function AttentionPage() {
  const { snapshot, now } = useShell()
  const features = attentionFeatures(snapshot, now)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">Needs attention</h1>
        <p className="m-0 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          A feature lands here when it has a blocked subtask, no activity for over a week, a pull request that has been
          waiting on review for more than two days, or an open callout from the run.
        </p>
      </header>

      {features.length === 0 ? (
        <EmptyState message="Nothing needs attention in this snapshot." />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading note={`${features.length} of ${snapshot.features.length} features`}>Flagged</SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {features.map((feature) => (
              <AttentionCard key={feature.key} feature={feature} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AttentionCard({ feature, now }: { feature: FeatureT; now: Date }) {
  const reasons = attentionReasons(feature, now)

  return (
    <li className="surface-card flex list-none flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="font-mono-data text-xs text-muted-foreground">{feature.code}</span>
        <ShellLink page="feature" code={featureSlug(feature.code)} className="text-[14.5px] font-medium">
          {feature.title}
        </ShellLink>
        <StatusPill status={feature.stage} className="shrink-0" />
        <OwnerLabel name={feature.owner} className="ml-auto text-xs text-muted-foreground" />
      </div>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {reasons.map((reason, i) => {
          const Icon = REASON_ICON[reason.kind]
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
              <span
                aria-hidden="true"
                data-status={REASON_STATUS[reason.kind]}
                className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md"
              >
                <Icon className="size-3" />
              </span>
              <span>{reason.detail}</span>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
