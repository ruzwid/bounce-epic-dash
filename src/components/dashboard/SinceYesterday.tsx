import type { ReactNode } from "react"
import { Package } from "lucide-react"
import type { z } from "zod"
import type { PrRef as PrRefSchema, Story as StorySchema } from "@/lib/schema"
import type { ChangeItem } from "@/lib/dashboard/diff"
import { groupChanges } from "@/lib/dashboard/diff"
import { featureSlug, featureTitleWithoutCode, isFeatureTicket } from "@/lib/dashboard/nav"
import { loginForDisplayName } from "@/lib/dashboard/appConfig"
import { statusLabel } from "@/lib/dashboard/statusLabels"
import { ShellLink } from "./shell/ShellLink"
import { useShell } from "./shell/ShellContext"
import { JiraLink } from "./JiraLink"
import { PersonChip } from "./PersonChip"
import { PrChip } from "./PrChip"

type StoryT = z.infer<typeof StorySchema>
type PrRefT = z.infer<typeof PrRefSchema>

/**
 * The since-last-snapshot feed, as structured text rather than a stack of
 * cards.
 *
 * Grouping is what makes it readable: "JIRA says Done, but no pull request
 * proves the code reached master" is said once, as a section note, instead
 * of once per row. The day this replaced, that single sentence was printed
 * seven times in a row and filled the first screen of the page.
 *
 * Cards are reserved for things you act on (feature rows, the review
 * queue). This is a report, so it's set as one.
 */
export function SinceYesterday({ changes }: { changes: ChangeItem[] }) {
  const sections = groupChanges(changes)

  return (
    <div className="flex flex-col gap-7">
      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" data-status-dot={section.status} className="size-1.5 shrink-0 rounded-full" />
            <h3 className="m-0 text-[11px] font-normal tracking-[0.09em] text-muted-foreground uppercase">
              {section.title}
            </h3>
            <span className="font-mono-data rounded-4xl bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
              {section.items.length}
            </span>
          </div>
          {/* Quote-line indent, the same device ReviewGroupCard hangs its
              pull requests off: the heading states the kind of change,
              and everything belonging to it is visibly subordinate to
              that line rather than merely sitting below it. Note and
              items share one rule so the section reads as a single block.
              `border-border` rather than the card version's
              `border-border-soft` — the soft tone is calibrated against
              bg-card, and disappears entirely on the page background. */}
          <Nest className="gap-3">
            {section.note ? (
              <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{section.note}</p>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {section.items.map((item, i) => (
                <ChangeLine key={`${item.feature.key}-${i}`} change={item} status={section.status} />
              ))}
            </ul>
          </Nest>
        </section>
      ))}
    </div>
  )
}

/** One rung of the hierarchy: a rule with everything under it indented
 *  past it. Used at three depths — section > feature > story > pull
 *  request — so the nesting is drawn by one component rather than three
 *  hand-tuned paddings that drift apart. */
function Nest({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`ml-[3px] flex flex-col border-l-2 border-border pl-4 ${className ?? ""}`}>{children}</div>
  )
}

/**
 * What a change looks like, decomposed the way the data actually nests.
 *
 * `note` is a fact about the feature itself (it stalled, its stage
 * slipped, product approved it) and stays on the feature's own line —
 * indenting it would imply a child object that doesn't exist. `stories`
 * are children, and get a rung; a story's pull request gets another.
 */
type ChangeBody = {
  note?: ReactNode
  stories?: { story: StoryT; note?: ReactNode; pr?: PrRefT; branch?: string }[]
}

function ChangeLine({ change, status }: { change: ChangeItem; status: string }) {
  const body = changeBody(change, status)
  const rows = body.stories ?? []
  // A pull request can be raised against any level of the hierarchy, and
  // a feature with no child tickets carries its own: collect.ts records
  // that as a "story" whose key IS the feature's key. Nesting it would
  // draw a level that doesn't exist and invent a story that was never
  // written — so its evidence hangs off the feature line itself. Same
  // rule, same helper, as the People page's in-flight tree.
  const ownTicket = rows.filter((row) => isFeatureTicket(row.story, change.feature))
  const childStories = rows.filter((row) => !isFeatureTicket(row.story, change.feature))
  const { epic } = useShell()

  return (
    <li className="flex flex-col gap-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <ShellLink
          page="feature"
          code={featureSlug(change.feature.code)}
          className="hover-fill inline-flex shrink-0 items-center gap-1.5 no-underline"
        >
          <Package aria-hidden="true" data-status-icon={status} className="size-3.5 shrink-0" />
          <span className="font-mono-data text-[13px] font-medium">{change.feature.code}</span>
        </ShellLink>
        <span className="min-w-0 truncate text-sm">{featureTitleWithoutCode(change.feature)}</span>
        <PersonChip login={loginForDisplayName(epic, change.feature.owner)} name={change.feature.owner} />
        {ownTicket.map((row) => (
          <span
            key={row.story.key}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          >
            <Evidence row={row} />
          </span>
        ))}
      </span>

      {body.note ? <span className="pl-[22px] text-xs leading-relaxed text-muted-foreground">{body.note}</span> : null}

      {childStories.length > 0 ? (
        <Nest className="gap-1.5">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {childStories.map((row) => (
              // The pull request stays on its story's line rather than
              // earning a rung of its own: a PR belongs to exactly one
              // ticket, so a third rule would spend a whole level (and
              // three lines of height per change) drawing a relationship
              // the reader can already see.
              <li
                key={row.story.key}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
              >
                <JiraLink issueKey={row.story.key} type="story" tone={row.story.status} className="shrink-0">
                  <span className="font-mono-data">{row.story.key}</span>
                </JiraLink>
                <Evidence row={row} feature={change.feature} />
              </li>
            ))}
          </ul>
        </Nest>
      ) : null}
    </li>
  )
}

type EvidenceRow = NonNullable<ChangeBody["stories"]>[number]

/** What happened to one ticket: its own note or summary, and the pull
 *  request that proves it. Shared by the two places a ticket can appear —
 *  nested under its feature, or on the feature's own line when the ticket
 *  and the feature are the same JIRA issue. */
function Evidence({ row, feature }: { row: EvidenceRow; feature?: ChangeItem["feature"] }) {
  const text = row.note ?? (feature ? summaryFor(row.story, feature) : null)

  return (
    <>
      {text ? <span className="min-w-0 truncate">{text}</span> : null}
      {row.pr ? (
        <>
          <PrChip pr={row.pr} />
          <span className="shrink-0">
            into <Branch name={row.pr.baseRef} />
          </span>
        </>
      ) : null}
      {row.branch ? (
        <span className="shrink-0">
          merged into <Branch name={row.branch} />, not master
        </span>
      ) : null}
    </>
  )
}

function changeBody(change: ChangeItem, status: string): ChangeBody {
  switch (change.kind) {
    case "shipped":
      return { stories: [{ story: change.story, pr: change.pr }] }
    case "released":
      return { note: "approved out of Product Review" }
    case "sent_for_sign_off":
      return { note: "waiting on a product decision" }
    case "newly_done_unverified":
    case "newly_blocked":
      return { stories: [{ story: change.story }] }
    case "newly_staged":
      return { stories: [{ story: change.story, branch: change.integrationBranch }] }
    case "regressed":
      return {
        stories: [
          {
            story: change.story,
            note: (
              <>
                {statusLabel(change.from).toLowerCase()} →{" "}
                <span className="font-medium text-foreground">{statusLabel(change.to).toLowerCase()}</span>
              </>
            ),
          },
        ],
      }
    case "feature_regressed":
      return {
        note: (
          <>
            {statusLabel(change.from).toLowerCase()} →{" "}
            <span className="font-medium text-foreground">{statusLabel(change.to).toLowerCase()}</span>
            {change.scoreDelta !== 0 ? <span className="font-mono-data"> ({change.scoreDelta} pts)</span> : null}
          </>
        ),
      }
    case "newly_stalled":
      return {
        note: (
          <>
            no commit in <span className="font-mono-data">{change.daysSinceLastActivity}</span> days
          </>
        ),
      }
    case "scope_added":
      // A feature that only just appeared is the news; naming all nine of
      // its stories underneath would bury it. One that grew by a story or
      // two is the opposite — "+1 story" tells you nothing at all, so the
      // stories themselves are the point.
      return change.isNewFeature
        ? {
            note: (
              <>
                joined the epic with <span className="font-mono-data">{change.stories.length}</span>{" "}
                {change.stories.length === 1 ? "story" : "stories"}
              </>
            ),
          }
        : { stories: change.stories.map((story) => ({ story })) }
    default: {
      // Exhaustiveness: a new ChangeItem kind fails the build here rather
      // than silently rendering a feature line with nothing under it.
      const _never: never = change
      void _never
      void status
      return {}
    }
  }
}

/** A single-story feature usually names its story after itself, so the
 *  nested row would repeat the title one line below the feature. Empty in
 *  that case: the key alone is the useful part. */
function summaryFor(story: StoryT, feature: ChangeItem["feature"]): string {
  const summary = story.summary.replace(feature.code, "").replace(/^\s*[—–-]?\s*/, "").trim()
  return summary === featureTitleWithoutCode(feature) ? "" : summary
}

function Branch({ name }: { name: string }) {
  return <code className="rounded-sm bg-muted px-1.5 py-0.5">{name}</code>
}
