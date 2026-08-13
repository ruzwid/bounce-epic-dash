import { ChevronRight, CircleAlert, Clock, GitPullRequestArrow, OctagonX } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import {
  attentionFeatures,
  attentionReasons,
  featureSlug,
  signedOffUnverifiedStories,
  type AttentionReason,
} from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatusPill } from "../StatusPill"
import { OwnerLabel } from "../OwnerLabel"
import { EmptyState } from "../EmptyState"
import { JiraLink } from "../JiraLink"

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
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          A feature lands here when it has a blocked story, no activity for over a week, a pull request that has been
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

      <SignedOffUnverifiedSection snapshot={snapshot} />
    </div>
  )
}

/**
 * done_unverified stories under a feature that's stage "done" only because
 * product signed off — collapsed by default. These are exactly the stories
 * a reader would otherwise have to go hunting for on a per-feature basis;
 * this section exists so "just in case" checking doesn't require opening
 * every signed-off feature one at a time, without making them a per-run
 * distraction the way the Flagged section above is.
 */
function SignedOffUnverifiedSection({ snapshot }: { snapshot: ReturnType<typeof useShell>["snapshot"] }) {
  const items = signedOffUnverifiedStories(snapshot)
  if (items.length === 0) return null

  return (
    <details className="group flex flex-col gap-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90"
        />
        {items.length} done-unverified {items.length === 1 ? "story" : "stories"} on signed-off features
      </summary>
      <p className="m-0 mt-1 pl-5 text-xs leading-relaxed text-muted-foreground">
        These features are marked done because product signed off, but GitHub still can't confirm every story
        reached master. Worth a glance, not a per-run check.
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {items.map(({ feature, story }) => (
          <li
            key={story.key}
            className="surface flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-4xl border border-dashed border-border px-5 py-3.5"
          >
            <JiraLink issueKey={story.key} type="story" tone={story.status} className="gap-1.5 text-sm">
              <span className="min-w-0 truncate">{story.summary}</span>
            </JiraLink>
            <ShellLink
              page="feature"
              code={featureSlug(feature.code)}
              className="hover-fill ml-auto font-mono-data shrink-0 text-xs text-muted-foreground no-underline"
            >
              {feature.code}
            </ShellLink>
          </li>
        ))}
      </ul>
    </details>
  )
}

function AttentionCard({ feature, now }: { feature: FeatureT; now: Date }) {
  const reasons = attentionReasons(feature, now)

  return (
    <li className="surface-card flex list-none flex-col gap-3 rounded-4xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* JiraLink wraps the primary title (icon + text, external Jira
            link) — same pattern as ReviewsPage's ReviewGroupCard header,
            rather than an internal ShellLink title with a bare icon
            alongside it. feature.title already starts with the code
            ("F1.1 — ..."), so there's no separate code label here. */}
        <JiraLink issueKey={feature.key} type="feature" tone={feature.stage} className="gap-1.5 text-[14.5px] font-medium">
          {feature.title}
        </JiraLink>
        <StatusPill status={feature.stage} className="shrink-0" />
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* The internal link to this app's own feature page, shown as
              the ticket key (not the code, which is already in the title
              above) — mirrors ReviewsPage's secondary ShellLink and
              FeatureCard's CardTitleRow, which both show the key
              separately from an already-coded title. */}
          <ShellLink
            page="feature"
            code={featureSlug(feature.code)}
            className="hover-fill font-mono-data text-xs text-muted-foreground no-underline"
          >
            {feature.key}
          </ShellLink>
          <OwnerLabel name={feature.owner} className="text-xs text-muted-foreground" />
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {reasons.map((reason, i) => {
          const Icon = REASON_ICON[reason.kind]
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
              <span
                aria-hidden="true"
                data-status={REASON_STATUS[reason.kind]}
                className="mt-px flex size-5 shrink-0 items-center justify-center rounded-4xl"
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
