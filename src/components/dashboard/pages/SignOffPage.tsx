import { CircleAlert, GitBranch } from "lucide-react"
import {
  SIGN_OFF_STAGES,
  approvedWithoutProof,
  bySignOffStage,
  signOffView,
  totalAc,
  type SignOffFeature,
} from "@/lib/dashboard/signoff"
import { featureSlug, featureTitleWithoutCode } from "@/lib/dashboard/nav"
import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { cn } from "@/lib/utils"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { PersonChip } from "../PersonChip"
import { IssueTitle, JiraLink } from "../JiraLink"
import { EmptyState } from "../EmptyState"

/**
 * The epic as the release pipeline product actually works in:
 *
 *   in progress → code review → to be released → product review → done
 *
 * Every other page answers "where is the code". This one answers "what is
 * waiting on a decision, and what was decided without evidence" — which is
 * a different question with a different owner, and the reason a feature
 * can read "Done" here while four of its stories were never seen on
 * master.
 */
export function SignOffPage() {
  const { snapshot } = useShell()
  const features = signOffView(snapshot)
  const unproven = approvedWithoutProof(features)
  const ac = totalAc(features)

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">Sign-off</h1>
        <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Where each feature sits against the product gate. Moving a feature ticket to Product Review emails its
          product manager; approval sends it to Done, so reaching Done <em>is</em> the sign-off.
        </p>
      </header>

      <Pipeline features={features} />

      {unproven.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading note="approved, but no pull request confirms the code reached master">
            Signed off without proof
          </SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unproven.map((entry) => (
              <li
                key={entry.feature.key}
                className="surface flex flex-col gap-2 rounded-4xl border border-border bg-card px-5 py-4"
              >
                <FeatureLine entry={entry} />
                <div className="ml-[3px] flex flex-col gap-1.5 border-l-2 border-border-soft pl-4">
                  <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                    Product approved this feature. These stories are Done in JIRA with nothing on a default branch to
                    show for it — usually a ticket closed without a linked pull request, occasionally work that never
                    landed.
                  </p>
                  <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
                    {entry.unverified.map((story) => (
                      <li key={story.key} className="flex min-w-0 items-center text-xs text-muted-foreground">
                        <JiraLink issueKey={story.key} type="story" tone={story.status}>
                          <IssueTitle issueKey={story.key} title={story.summary} />
                        </JiraLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {SIGN_OFF_STAGES.map((stage) => {
        const group = bySignOffStage(features, stage.id)
        return (
          <section key={stage.id} className="flex flex-col gap-3">
            <SectionHeading note={`${group.length} ${group.length === 1 ? "feature" : "features"}`}>
              {stage.title}
            </SectionHeading>
            <p className="m-0 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">{stage.note}</p>
            {group.length === 0 ? (
              <EmptyState message="Nothing here in this snapshot." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {group.map((entry) => (
                  <li
                    key={entry.feature.key}
                    className="surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-4xl border border-border bg-card px-5 py-3.5"
                  >
                    <FeatureLine entry={entry} />
                    <AcBar ac={entry.ac} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <p className="m-0 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        Acceptance-criteria coverage across the epic:{" "}
        <span className="font-mono-data text-foreground">
          {ac.covered}/{ac.total}
        </span>{" "}
        covered, <span className="font-mono-data">{ac.partial}</span> partial,{" "}
        <span className="font-mono-data">{ac.noSignal}</span> with no signal. Coverage is judged from pull request
        descriptions, so "no signal" means nobody wrote down what a change did — not that the work is missing.
      </p>
    </div>
  )
}

/** The four stages in flow order, and their hue from the status family —
 *  module scope because neither depends on a render. */
const PIPELINE_ORDER = ["building", "code_complete", "with_product", "signed_off"] as const

const PIPELINE_COLORS: Record<(typeof PIPELINE_ORDER)[number], string> = {
  building: "var(--status-in-progress)",
  code_complete: "var(--status-staged)",
  with_product: "var(--status-with-product)",
  signed_off: "var(--status-shipped)",
}

/**
 * The signature element: the pipeline itself, as one bar of four
 * proportional segments in flow order.
 *
 * Numbering the stages would be decoration — but this genuinely is a
 * sequence, and a feature moves left to right through it, so the bar
 * carries real information: where the epic is bunched up. Four features
 * sitting in "with product" is a different problem from four sitting in
 * "code complete, not sent", and the shape says which without reading.
 */
function Pipeline({ features }: { features: SignOffFeature[] }) {
  const counts = PIPELINE_ORDER.map((id) => ({
    id,
    title: SIGN_OFF_STAGES.find((s) => s.id === id)!.title,
    count: bySignOffStage(features, id).length,
  }))
  const total = Math.max(1, features.length)

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-xl bg-muted"
        role="img"
        aria-label={counts.map((c) => `${c.count} ${c.title.toLowerCase()}`).join(", ")}
      >
        {counts.map((c) => (
          <span key={c.id} className="h-full" style={{ width: `${(c.count / total) * 100}%`, background: PIPELINE_COLORS[c.id] }} />
        ))}
      </div>
      <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {counts.map((c) => (
          <li key={c.id} className="flex items-baseline gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: PIPELINE_COLORS[c.id] }} />
            <span className="font-mono-data text-[17px] leading-none">{c.count}</span>
            <span className="text-[11px] text-muted-foreground">{c.title.toLowerCase()}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FeatureLine({ entry }: { entry: SignOffFeature }) {
  const { epic } = useShell()
  const { feature } = entry
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
      {/* Code and title are one target: the title is the obvious thing to
          aim at, and having it sit dead beside a four-character link made
          the row look unclickable. It stops at the end of the title rather
          than running the width of the row — everything after it (owner,
          gate warnings, the AC bar) belongs to something else. */}
      <ShellLink
        page="feature"
        code={featureSlug(feature.code)}
        className="hover-fill inline-flex min-w-0 items-center gap-1.5 no-underline"
        title={feature.title}
      >
        <span aria-hidden="true" data-status-dot={feature.stage} className="size-2 shrink-0 rounded-full" />
        <span className="min-w-0 truncate text-sm">
          <IssueTitle issueKey={feature.code} title={featureTitleWithoutCode(feature)} />
        </span>
      </ShellLink>
      <PersonChip login={loginForDisplayName(epic, feature.owner)} name={feature.owner} />
      {entry.gateOpen ? (
        <span
          className="flex shrink-0 items-center gap-1 text-xs"
          style={{ color: "var(--status-staged)" }}
          title="Merged to an integration branch with no release pull request to master"
        >
          <GitBranch aria-hidden="true" className="size-3.5" />
          release gate open
        </span>
      ) : null}
      {entry.stage !== "signed_off" && entry.unverified.length > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1 text-xs"
          style={{ color: "var(--status-done-unverified)" }}
          title="Done in JIRA, with no pull request confirming the code reached master"
        >
          <CircleAlert aria-hidden="true" className="size-3.5" />
          <span className="font-mono-data">{entry.unverified.length}</span> unverified
        </span>
      ) : null}
    </span>
  )
}

/** Acceptance criteria as a row of one cell per bullet — few enough to
 *  count at a glance, and a bar would hide that "3 of 4" and "30 of 40"
 *  are different kinds of confidence. */
function AcBar({ ac }: { ac: SignOffFeature["ac"] }) {
  if (ac.total === 0) {
    return <span className="shrink-0 text-[11px] text-muted-foreground">no AC tracked</span>
  }

  const cells = [
    ...Array(ac.covered).fill("var(--status-shipped)"),
    ...Array(ac.partial).fill("var(--status-in-review)"),
    ...Array(ac.noSignal).fill("var(--status-todo)"),
  ] as string[]

  return (
    <span
      className="flex shrink-0 items-center gap-2"
      title={`${ac.covered} covered, ${ac.partial} partial, ${ac.noSignal} no signal`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {cells.map((color, i) => (
          <span key={i} className={cn("h-2.5 w-2 rounded-[1.5px]")} style={{ background: color }} />
        ))}
      </span>
      <span className="font-mono-data text-[11px] text-muted-foreground">
        {ac.covered}/{ac.total} AC
      </span>
    </span>
  )
}

