import { useState } from "react"
import { Hourglass } from "lucide-react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import { computeChanges, groupChangesByOwner } from "@/lib/dashboard/diff"
import { buildWeeklySummary, untouchedAllWeek, weekTotals } from "@/lib/dashboard/weekly"
import { featureSlug, featureTitleWithoutCode } from "@/lib/dashboard/nav"
import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { Button } from "@/components/ui/button"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { SinceYesterday } from "../SinceYesterday"
import { PersonChip } from "../PersonChip"
import { EmptyState } from "../EmptyState"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

/**
 * The week, for the update somebody has to write on Monday.
 *
 * Same diff engine as Today, run across a seven-day gap instead of one
 * day — so this page and seven days of Today pages can never tell
 * different stories. What it adds is the two things a day can't see: what
 * the week cost in scope, and what nobody touched for the whole of it.
 */
export function WeekPage({ past }: { past: StatusSnapshotT | null }) {
  const { epic, snapshot } = useShell()
  const [copied, setCopied] = useState(false)

  if (!past) {
    return (
      <div className="flex flex-col gap-7">
        <WeekHeader />
        <EmptyState message="Only one snapshot on record — there is no earlier week to compare against yet." />
      </div>
    )
  }

  const totals = weekTotals(snapshot, past)
  const changes = computeChanges(snapshot, past)
  const stuck = untouchedAllWeek(snapshot, totals.days)
  const byOwner = groupChangesByOwner(changes)
  const delta = totals.percentTo - totals.percentFrom

  async function copySummary() {
    await navigator.clipboard.writeText(buildWeeklySummary(snapshot, totals, changes, stuck))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-7">
      <WeekHeader />

      <section className="flex flex-col gap-3">
        <SectionHeading
          note={`${totals.from} → ${totals.to} · ${totals.days} days`}
          actions={
            <Button variant="secondary" size="sm" onClick={copySummary}>
              {copied ? "Copied" : "Copy this week"}
            </Button>
          }
        >
          The week in figures
        </SectionHeading>
        <StatStrip
          stats={[
            {
              label: "Stories shipped to master",
              value: signed(totals.shipped),
              // A week where the shipped count went *down* is the one
              // figure on this page nobody expects to see, so it gets the
              // alarm hue rather than the same muted treatment as a quiet
              // week.
              color:
                totals.shipped > 0
                  ? "var(--pr-shipped)"
                  : totals.shipped < 0
                    ? "var(--status-blocked)"
                    : undefined,
            },
            { label: "Finished, counting Done-unverified", value: signed(totals.done) },
            {
              label: "Stories in scope",
              value: signed(totals.stories),
              sublabel: totals.features !== 0 ? `${signed(totals.features)} features` : undefined,
              color: totals.stories > 0 ? "var(--status-todo)" : undefined,
            },
            {
              label: "Epic complete",
              value: `${totals.percentTo}%`,
              sublabel: `${signed(delta)} pts`,
              color: delta > 0 ? "var(--status-shipped)" : delta < 0 ? "var(--status-blocked)" : undefined,
            },
          ]}
        />
        {totals.stories > 0 && totals.done > 0 && totals.stories >= totals.done ? (
          <p className="m-0 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            Scope grew at least as fast as work finished this week, which is why the percentage moved less than the
            shipping suggests. See <ShellLink page="scope" className="underline">Scope</ShellLink> for where it came
            from.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading note={`${changes.length} ${changes.length === 1 ? "change" : "changes"}`}>
          What moved
        </SectionHeading>
        {changes.length === 0 ? (
          <EmptyState message={`Nothing changed between ${totals.from} and ${totals.to}.`} />
        ) : (
          <SinceYesterday changes={changes} />
        )}
      </section>

      {byOwner.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading note="the same changes, by whose feature they were">Who moved what</SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {byOwner.map(({ owner, items }) => (
              <li
                key={owner}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-4xl border border-border bg-card px-5 py-3"
              >
                <PersonChip login={loginForDisplayName(epic, owner)} name={owner} />
                <span className="font-mono-data text-sm">{items.length}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length === 1 ? "change" : "changes"} across{" "}
                  {new Set(items.map((i) => i.feature.key)).size}{" "}
                  {new Set(items.map((i) => i.feature.key)).size === 1 ? "feature" : "features"}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {[...new Set(items.map((i) => i.feature.key))].slice(0, 6).map((key) => {
                    const feature = items.find((i) => i.feature.key === key)!.feature
                    return (
                      <ShellLink
                        key={key}
                        page="feature"
                        code={featureSlug(feature.code)}
                        className="hover-fill inline-flex items-center gap-1.5 no-underline"
                        title={feature.title}
                      >
                        <span aria-hidden="true" data-status-dot={feature.stage} className="size-2 rounded-full" />
                        <span className="font-mono-data text-xs">{feature.code}</span>
                      </ShellLink>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading note={`no commit in ${totals.days}+ days`}>Untouched all week</SectionHeading>
        {stuck.length === 0 ? (
          <EmptyState message="Every unfinished feature saw activity this week." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {stuck.map((feature) => (
              <li
                key={feature.key}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-4xl border border-border bg-card px-5 py-3"
              >
                <ShellLink
                  page="feature"
                  code={featureSlug(feature.code)}
                  className="hover-fill inline-flex shrink-0 items-center gap-1.5 no-underline"
                >
                  <span aria-hidden="true" data-status-dot={feature.stage} className="size-2 rounded-full" />
                  <span className="font-mono-data text-[13px] font-medium">{feature.code}</span>
                </ShellLink>
                <span className="min-w-0 flex-1 truncate text-sm">{featureTitleWithoutCode(feature)}</span>
                <PersonChip login={loginForDisplayName(epic, feature.owner)} name={feature.owner} />
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Hourglass aria-hidden="true" className="size-3.5" />
                  <span className="font-mono-data">{feature.daysSinceLastActivity}d</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function WeekHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-display m-0 text-[28px] leading-tight">This week</h1>
      <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
        The same change feed Today runs, widened to a week — what shipped, what slipped, what it cost in scope, and
        what nobody touched.
      </p>
    </header>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}


