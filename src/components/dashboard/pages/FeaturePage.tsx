import { useState } from "react"
import { Check, Minus } from "lucide-react"
import type { z } from "zod"
import type { AcCoverage as AcCoverageSchema, Feature as FeatureSchema, Story as StorySchema } from "@/lib/schema"
import { WORK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"
import { featurePrs } from "@/lib/stories"
import { cn } from "@/lib/utils"
import { useShell } from "../shell/ShellContext"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { StoryCard } from "../StoryCard"
import { StatusPill } from "../StatusPill"
import { OwnerLabel } from "../OwnerLabel"
import { Callout } from "../Callout"
import { EmptyState } from "../EmptyState"
import { OverrideNote } from "../OverrideNote"
import { ReleaseGateLine } from "../ReleaseGateLine"
import { JiraLink } from "../JiraLink"

type FeatureT = z.infer<typeof FeatureSchema>
type StoryT = z.infer<typeof StorySchema>
type AcCoverageT = z.infer<typeof AcCoverageSchema>

const CONFIDENCE_LABEL: Record<FeatureT["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
}

type StoryFilter = "all" | "in_review" | "staged" | "no_pr"

const FILTERS: { id: StoryFilter; label: string; match: (s: StoryT) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "in_review", label: "Needs review", match: (s) => s.status === "in_review" },
  { id: "staged", label: "Staged", match: (s) => s.status === "staged" },
  { id: "no_pr", label: "No PR", match: (s) => s.prs.length === 0 },
]

export function FeaturePage({ feature }: { feature: FeatureT }) {
  const { previous } = useShell()
  const [filter, setFilter] = useState<StoryFilter>("all")

  const previousFeature = previous?.features.find((f) => f.key === feature.key) ?? null
  const scoreDelta = previousFeature ? feature.score - previousFeature.score : null
  const openPrCount = featurePrs(feature).filter((pr) => pr.state === "OPEN").length
  const acCovered = feature.acCoverage.filter((ac) => ac.coverage === "covered").length
  const gaps = feature.acCoverage.filter((ac) => ac.coverage === "no_signal")

  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!
  const visibleStories = feature.stories.filter(activeFilter.match)

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-64 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono-data">
              {feature.milestone} · {feature.key}
            </span>
            <span aria-hidden="true">·</span>
            <OwnerLabel name={feature.owner} />
            <span aria-hidden="true">·</span>
            <span className="font-mono-data">{feature.repos.join(", ") || "no repo mapped"}</span>
          </div>
          <h1 className="font-display m-0 text-[28px] leading-tight">
            <JiraLink issueKey={feature.key} type="feature" tone={feature.stage} className="gap-2" iconClassName="size-5">
              {feature.title}
            </JiraLink>
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusPill status={feature.stage} />
            <span className="rounded-4xl bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {CONFIDENCE_LABEL[feature.confidence]}
            </span>
          </div>
          {/* Two different claims, kept visibly apart: the ticket's own
              goal (what this is for, written by a human, unchanging) above
              the judge's read on progress (what's true today). Collapsing
              them into one paragraph would let a generated sentence pass
              as spec. */}
          {feature.overview ? (
            <p className="m-0 mt-3 text-sm leading-relaxed">{feature.overview}</p>
          ) : null}
          <p className="m-0 mt-2.5 border-l-2 border-border pl-3 text-[13.5px] leading-relaxed text-muted-foreground">
            {feature.rationale}
          </p>
        </div>

        {/* Full width and left-aligned once the header stacks — a
            right-aligned figure under a left-aligned title reads as a
            stray element rather than a column. */}
        <div className="w-full text-left sm:w-auto sm:flex-none sm:text-right">
          <div className="font-display font-mono-data text-[44px] leading-none">
            {feature.dataOk ? `${feature.score}%` : "—"}
          </div>
          <ScoreDelta delta={scoreDelta} from={previousFeature?.score ?? null} to={feature.score} />
        </div>
      </header>

      {!feature.dataOk ? (
        <EmptyState message="Data unavailable for this feature — a collection error affected it. The figures below are not reliable." />
      ) : null}

      <StatStrip
        stats={[
          {
            label: "Since last activity",
            value: feature.daysSinceLastActivity === null ? "—" : `${feature.daysSinceLastActivity}d`,
          },
          {
            label: "Oldest staged work",
            value: feature.daysInStaged === null ? "—" : `${feature.daysInStaged}d`,
            color: feature.daysInStaged === null ? undefined : "var(--status-staged)",
          },
          {
            label: "Acceptance criteria covered",
            value:
              feature.acCoverage.length === 0 ? (
                "—"
              ) : (
                <>
                  {acCovered}
                  <span className="text-[15px] text-muted-foreground">/{feature.acCoverage.length}</span>
                </>
              ),
          },
          {
            label: "PRs open",
            value: openPrCount,
            color: openPrCount > 0 ? "var(--status-in-review)" : undefined,
          },
        ]}
      />

      {feature.callouts.length > 0 || feature.override || feature.releaseGate ? (
        <section className="flex flex-col gap-2">
          {feature.callouts.map((callout, i) => (
            <Callout key={i} callout={callout} />
          ))}
          <ReleaseGateLine releaseGate={feature.releaseGate} />
          {feature.override ? <OverrideNote override={feature.override} /> : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading
          actions={FILTERS.map((option) => {
            const count = feature.stories.filter(option.match).length
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                data-selected={filter === option.id}
                className="chip inline-flex items-center gap-1.5 rounded-4xl border border-border px-3 py-1.5 text-xs"
              >
                {option.label}
                <span className="font-mono-data opacity-60">{count}</span>
              </button>
            )
          })}
        >
          Stories
        </SectionHeading>

        {visibleStories.length === 0 ? (
          <EmptyState
            message={
              feature.stories.length === 0
                ? "No stories on this feature yet."
                : `No stories match "${activeFilter.label}".`
            }
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {visibleStories.map((story) => (
              <StoryCard key={story.key} story={story} />
            ))}
          </ul>
        )}

        {feature.stories.length > 0 ? <StatusMixLine feature={feature} /> : null}
      </section>

      <section className="grid gap-x-10 gap-y-8 border-t border-border pt-7 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionHeading>Acceptance criteria</SectionHeading>
          {feature.acCoverage.length === 0 ? (
            <EmptyState message="No acceptance criteria tracked for this feature." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {feature.acCoverage.map((ac) => (
                <AcRow key={ac.id} ac={ac} />
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeading>Gaps</SectionHeading>
          {gaps.length === 0 ? (
            <EmptyState message="Every acceptance criterion has at least partial evidence." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {gaps.map((ac) => (
                <li
                  key={ac.id}
                  data-status="in_progress"
                  className="flex items-start gap-2.5 rounded-4xl px-3.5 py-2.5 text-[13.5px]"
                >
                  <span aria-hidden="true" className="mt-0.5 font-medium">
                    !
                  </span>
                  <span>
                    {ac.label} — <span className="opacity-75">no ticket or code</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            Criteria are read from the ticket description on every run. A gap closes on its own once a story or PR
            matching it appears — nothing here is closed by hand.
          </p>
        </div>
      </section>
    </article>
  )
}

function ScoreDelta({ delta, from, to }: { delta: number | null; from: number | null; to: number }) {
  if (delta === null) return <div className="mt-1 text-xs text-muted-foreground">No previous snapshot</div>
  if (delta === 0) return <div className="mt-1 text-xs text-muted-foreground">Unchanged since last snapshot</div>
  return (
    <div
      className="mt-1 text-xs"
      style={{ color: delta > 0 ? "var(--status-shipped)" : "var(--status-blocked)" }}
    >
      {delta > 0 ? "▲" : "▼"} <span className="font-mono-data">{Math.abs(delta)}</span> pts (
      <span className="font-mono-data">
        {from}% → {to}%
      </span>
      )
    </div>
  )
}

/** The raw counts behind the score, in words. The bar and the percentage
 *  both compress this; the compressed form is what gets misread. */
function StatusMixLine({ feature }: { feature: FeatureT }) {
  const parts = (
    [
      ["shipped", feature.scoreBasis.shipped],
      ["staged", feature.scoreBasis.staged],
      ["in_review", feature.scoreBasis.inReview],
      ["in_progress", feature.scoreBasis.inProgress],
      ["blocked", feature.scoreBasis.blocked],
      ["todo", feature.scoreBasis.todo],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${WORK_STATUS_LABELS[status].toLowerCase()}`)

  return (
    <p className="font-mono-data m-0 text-xs text-muted-foreground">
      {feature.scoreBasis.total} tracked · {parts.join(", ")}
    </p>
  )
}

function AcRow({ ac }: { ac: AcCoverageT }) {
  const isCovered = ac.coverage === "covered"
  const isPartial = ac.coverage === "partial"

  return (
    <li className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
        style={{
          color: isCovered ? "var(--status-shipped)" : isPartial ? "var(--status-staged)" : "var(--muted-foreground)",
        }}
      >
        {isCovered ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
      </span>
      <span className={cn(!isCovered && "text-muted-foreground")}>
        {ac.label}
        {isPartial ? <span className="ml-1.5 text-xs opacity-75">partial</span> : null}
        {ac.evidence.length > 0 ? (
          <span className="font-mono-data ml-1.5 text-[11px] opacity-60">{ac.evidence.join(", ")}</span>
        ) : null}
      </span>
      <span className="sr-only">
        {isCovered ? "covered" : isPartial ? "partially covered" : "no signal"}
      </span>
    </li>
  )
}
