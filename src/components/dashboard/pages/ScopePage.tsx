import { growthByFeature, scopeTimeline, type ScopeEntry, type ScopeSnapshot, type ScopeStep } from "@/lib/dashboard/scope"
import { featureSlug, featureTitleWithoutCode } from "@/lib/dashboard/nav"
import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { PersonChip } from "../PersonChip"
import { JiraLink } from "../JiraLink"
import { EmptyState } from "../EmptyState"

/**
 * The denominator, watched.
 *
 * Completion is finished work over scope, and this dashboard only ever
 * shows the numerator moving. In this epic's first three days scope went
 * from 47 stories to 74 and completion "fell" from 79% to 62% — nobody
 * did anything wrong, and no other page can say so.
 */
export function ScopePage({ snapshots }: { snapshots: ScopeSnapshot[] }) {
  const { epic, snapshot } = useShell()
  const timeline = scopeTimeline(snapshots)

  if (!timeline) {
    return (
      <div className="flex flex-col gap-7">
        <ScopeHeader />
        <EmptyState message="Scope changes need two snapshots to compare — check back tomorrow." />
      </div>
    )
  }

  const growth = growthByFeature(timeline)
  const grew = timeline.netStories > 0

  return (
    <div className="flex flex-col gap-7">
      <ScopeHeader />

      <section className="flex flex-col gap-3">
        <SectionHeading note={`${timeline.first.date} → ${timeline.latest.date}`}>Since the first snapshot</SectionHeading>
        <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed">
          The epic went from <span className="font-mono-data">{timeline.first.stories}</span> stories across{" "}
          <span className="font-mono-data">{timeline.first.features}</span> features to{" "}
          <span className="font-mono-data">{timeline.latest.stories}</span> across{" "}
          <span className="font-mono-data">{timeline.latest.features}</span>
          {timeline.netStories === 0 ? (
            <> — no net change in scope.</>
          ) : (
            <>
              {" "}
              — <span className="font-medium">{grew ? "growth" : "reduction"}</span> of{" "}
              <span className="font-mono-data">{Math.abs(timeline.netStories)}</span> stories
              {timeline.netFeatures !== 0 ? (
                <>
                  {" "}
                  and <span className="font-mono-data">{Math.abs(timeline.netFeatures)}</span> features
                </>
              ) : null}
              .
            </>
          )}
        </p>
        {grew ? <GrowthBar timeline={timeline} /> : null}
      </section>

      {growth.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading note="biggest first">Where it came from</SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {growth.map(({ feature, stories, isNew }) => (
              <li
                key={feature.key}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-4xl border border-border bg-card px-5 py-3"
              >
                <FeatureLink code={feature.code} stage={feature.stage} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {featureTitleWithoutCode(feature)}
                </span>
                <PersonChip login={loginForDisplayName(epic, feature.owner)} name={feature.owner} />
                {/* Plain text, not a pill: on this epic almost every row
                    is a new feature, and nine filled badges down the page
                    shout a fact that is only worth a glance. */}
                {isNew ? <span className="shrink-0 text-[11px] text-muted-foreground">new feature</span> : null}
                <span className="font-mono-data shrink-0 text-sm" style={{ color: "var(--status-todo)" }}>
                  +{stories}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHeading note="newest first">Day by day</SectionHeading>
        <div className="flex flex-col gap-6">
          {timeline.steps.map((step) => (
            <Step key={step.date} step={step} isLatest={step.date === snapshot.date} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ScopeHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-display m-0 text-[28px] leading-tight">Scope</h1>
      <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
        What the epic was asked to do, and how that changed. Every percentage on this dashboard is finished work over
        this number, so a percentage can fall on a day when nothing went wrong.
      </p>
    </header>
  )
}

/**
 * The signature element: the original scope and everything added since,
 * on one track.
 *
 * A line chart of story count over time is the obvious answer and the
 * wrong one — with a handful of snapshots it draws a staircase whose
 * shape says nothing. The question is "how much of what we are now
 * counting was in the original ask", and that is a proportion, so it is
 * drawn as one.
 */
function GrowthBar({ timeline }: { timeline: NonNullable<ReturnType<typeof scopeTimeline>> }) {
  const originalShare = (timeline.first.stories / timeline.latest.stories) * 100

  return (
    <div className="flex flex-col gap-2">
      {/* One fill on an empty track, not two segments. The obvious version
          — original in one grey, added in another — is unreadable in this
          palette: --status-todo and --muted-foreground are both greys a
          few percent apart, which is correct for their real jobs and
          useless side by side. The track carries the original scope, the
          fill carries what was added, and the fill sits at the right-hand
          end because that is when it arrived. */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-md bg-muted"
        role="img"
        aria-label={`${timeline.first.stories} stories at the first snapshot, ${timeline.netStories} added since`}
      >
        <span className="h-full" style={{ width: `${originalShare}%` }} />
        <span className="h-full" style={{ width: `${100 - originalShare}%`, background: "var(--status-todo)" }} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-muted" />
          <span className="font-mono-data">{timeline.first.stories}</span> at {timeline.first.date}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: "var(--status-todo)" }} />
          <span className="font-mono-data">{timeline.netStories}</span> added since (
          {Math.round(100 - originalShare)}% of what is tracked today)
        </span>
      </div>
    </div>
  )
}

/** One snapshot-to-snapshot step, using the same quote-line rung as the
 *  change feed — the date states the fact, everything belonging to it is
 *  visibly subordinate. */
function Step({ step, isLatest }: { step: ScopeStep; isLatest: boolean }) {
  const quiet = step.added.length === 0 && step.removedFeatures.length === 0 && step.removedStories.length === 0

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono-data m-0 text-[13px] font-medium">{step.date}</h3>
        {isLatest ? <span className="eyebrow">latest</span> : null}
        <span
          className="font-mono-data text-xs"
          style={{
            color:
              step.storiesDelta > 0
                ? "var(--status-todo)"
                : step.storiesDelta < 0
                  ? "var(--status-blocked)"
                  : undefined,
          }}
        >
          {step.storiesDelta === 0 ? "no change" : `${step.storiesDelta > 0 ? "+" : ""}${step.storiesDelta} stories`}
        </span>
        <span className="text-xs text-muted-foreground">
          <span className="font-mono-data">{step.stories}</span> tracked
        </span>
      </div>

      <div className="ml-[3px] flex flex-col gap-2.5 border-l-2 border-border pl-4">
        {quiet ? (
          <p className="m-0 text-[13px] text-muted-foreground">
            Nothing joined or left the epic between {step.previousDate} and {step.date}.
          </p>
        ) : null}

        {step.added.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {step.added.map((entry) => (
              <AddedLine key={entry.feature.key} entry={entry} />
            ))}
          </ul>
        ) : null}

        {step.removedFeatures.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="eyebrow m-0" style={{ color: "var(--status-blocked)" }}>
              Left the epic
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
              {step.removedFeatures.map((feature) => (
                <li key={feature.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-mono-data">{feature.code}</span>
                  <span className="min-w-0 truncate">{featureTitleWithoutCode(feature)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.removedStories.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="eyebrow m-0">Stories dropped</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {step.removedStories.map(({ feature, stories }) => (
                <li key={feature.key} className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-mono-data">{feature.code}</span>
                  {stories.map((story) => (
                    <span key={story.key} className="font-mono-data">
                      {story.key}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AddedLine({ entry }: { entry: ScopeEntry }) {
  const { epic } = useShell()
  return (
    <li className="flex flex-col gap-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <FeatureLink code={entry.feature.code} stage={entry.feature.stage} />
        <span className="min-w-0 truncate text-sm">{featureTitleWithoutCode(entry.feature)}</span>
        <PersonChip login={loginForDisplayName(epic, entry.feature.owner)} name={entry.feature.owner} />
        <span className="font-mono-data text-xs" style={{ color: "var(--status-todo)" }}>
          +{entry.stories.length}
        </span>
      </span>
      {entry.isNewFeature ? (
        <span className="pl-[22px] text-xs text-muted-foreground">
          joined the epic with <span className="font-mono-data">{entry.stories.length}</span>{" "}
          {entry.stories.length === 1 ? "story" : "stories"}
        </span>
      ) : (
        <ul className="m-0 ml-[3px] flex list-none flex-wrap gap-x-3 gap-y-1 border-l-2 border-border-soft p-0 pl-4">
          {entry.stories.map((story) => (
            <li key={story.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <JiraLink issueKey={story.key} type="story" tone={story.status}>
                <span className="font-mono-data">{story.key}</span>
              </JiraLink>
              <span className="min-w-0 truncate">{story.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function FeatureLink({ code, stage }: { code: string; stage: string }) {
  return (
    <ShellLink
      page="feature"
      code={featureSlug(code)}
      className="hover-fill inline-flex shrink-0 items-center gap-1.5 no-underline"
    >
      <span aria-hidden="true" data-status-dot={stage} className="size-2 shrink-0 rounded-full" />
      <span className="font-mono-data text-[13px] font-medium">{code}</span>
    </ShellLink>
  )
}

