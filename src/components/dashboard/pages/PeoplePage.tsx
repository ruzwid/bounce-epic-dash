import { useState } from "react"
import { CircleDotDashed, FileText, GitPullRequestArrow, ListTree, Package, Rows3, TriangleAlert } from "lucide-react"
import { SiJira } from "react-icons/si"
import { FaSlack } from "react-icons/fa6"
import type { z } from "zod"
import type { Feature as FeatureSchema, PrRef as PrRefSchema, StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import {
  workInFlight,
  peopleLoad,
  scopeToActiveMilestones,
  type FeatureWork,
  type PersonLoad,
  type PrWork,
} from "@/lib/dashboard/people"
import { featureSlug, featureTitleWithoutCode, isFeatureTicket, reviewersForPr } from "@/lib/dashboard/nav"
import { displayNameForLogin, personLinks } from "@/lib/dashboard/appConfig"
import { firstName, PersonTip } from "../PersonTip"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatStrip } from "../StatStrip"
import { Avatar } from "../Avatar"
import { StatusPill } from "../StatusPill"
import { IssueTitle, JiraLink } from "../JiraLink"
import { PrChip } from "../PrChip"
import { ReviewerChip, orderReviewers } from "../ReviewerChip"
import { EmptyState } from "../EmptyState"

type FeatureT = z.infer<typeof FeatureSchema>
type PrRefT = z.infer<typeof PrRefSchema>
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

/** How much of each person's work the page spells out. Detailed is the
 *  default because it is the standup view — screen-shared, read out person
 *  by person, so it has to answer "what are you on, what's stuck, what do
 *  you need looked at" without anyone clicking through. Compact drops to
 *  one line per person for a scan of who is carrying what. */
type Density = "compact" | "detailed"

/**
 * The epic by person.
 *
 * Ordered by load, and load is deliberately two different things stacked
 * in one bar: work this person owns, and work waiting on this person. A
 * lead scanning the page is looking for the second kind — someone with
 * four reviews in their queue is why three other people are blocked, and
 * that never shows up on a page organised by ticket.
 */
export function PeoplePage() {
  const { snapshot, asOf } = useShell()
  const [density, setDensity] = useState<Density>("detailed")
  // On by default: a milestone that's fully done (M1, once every F1.x is)
  // has nothing left for a lead to check on, and left in the mix it pads
  // every card with a feature nobody needs to look at any more. Off shows
  // the whole epic, finished milestones included.
  const [activeOnly, setActiveOnly] = useState(true)
  const detailed = density === "detailed"
  const scoped = activeOnly ? scopeToActiveMilestones(snapshot) : snapshot
  const people = peopleLoad(scoped, asOf)

  const busiest = Math.max(1, ...people.map((p) => p.features.length + p.reviewing.length))

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">People</h1>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          Everyone who owns a feature, wrote a pull request, or has one waiting on them in this snapshot — sorted by
          how much is on them.
        </p>
      </header>

      {people.length === 0 ? (
        <EmptyState
          message={
            activeOnly
              ? "Nobody is on an active milestone in this snapshot — turn off “Active milestones only” to see everyone."
              : "Nobody is named anywhere in this snapshot."
          }
        />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading
            note={`${people.length} ${people.length === 1 ? "person" : "people"}`}
            actions={
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
                  Active milestones only
                </label>
                {/* One button that switches, labelled with what you get
                    from pressing it rather than with the state you are
                    already in — the same rule the rest of the interface
                    follows, where a control says what happens when it is
                    used. The glyph says the same thing twice over: a tree
                    when the press will nest stories under their features,
                    flat rows when it will put them away. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDensity(detailed ? "compact" : "detailed")}
                  title={detailed ? "Show one line per person" : "Show titles, stories and pull request detail"}
                >
                  {detailed ? (
                    <Rows3 aria-hidden="true" className="size-3.5 opacity-70" />
                  ) : (
                    <ListTree aria-hidden="true" className="size-3.5 opacity-70" />
                  )}
                  {detailed ? "Compact" : "Detailed"}
                </Button>
              </div>
            }
          >
            Who is carrying what
          </SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {people.map((person) => (
              <PersonCard
                key={person.login ?? person.name}
                person={person}
                busiest={busiest}
                density={density}
                snapshot={scoped}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * One person, in the order a standup goes: what they are working on, what
 * is wrong with it, what is queued on them, and — last, because it is
 * background rather than news — everything they own.
 */
function PersonCard({
  person,
  busiest,
  density,
  snapshot,
}: {
  person: PersonLoad
  busiest: number
  density: Density
  // Passed down rather than read from useShell(): it has to be the same
  // (possibly milestone-scoped) snapshot peopleLoad built `person` from,
  // or a finished milestone's in-flight work would reappear here even
  // with "Active milestones only" on.
  snapshot: StatusSnapshotT
}) {
  const { epic, asOf } = useShell()
  const detailed = density === "detailed"
  const work = workInFlight(person, snapshot, asOf)
  const owed = person.reviewing.length
  const first = person.name.split(" ")[0]

  return (
    <li className="surface flex flex-col gap-4 rounded-4xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar login={person.login} name={person.name} size={28} />
          <span className="truncate text-[15px] font-medium">{person.name}</span>
          {/* The handle, small and mono, so the name on the card and the
              login in every PR chip and reviewer badge are visibly the
              same person. */}
          {person.login ? (
            <span className="font-mono-data truncate text-xs text-muted-foreground">{person.login}</span>
          ) : null}
        </span>

        {person.login ? <PersonLinkButtons login={person.login} name={first} /> : null}

        <LoadBar person={person} busiest={busiest} />

        {person.waitingOn.length > 0 ? (
          // Who they're blocked by, as faces — the mirror of the "Waiting
          // on X" block further down, which is who is blocked by them.
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            Waiting on
            <span className="flex items-center gap-1">
              {person.waitingOn.map((login) => {
                const name = displayNameForLogin(epic, login) ?? login
                return (
                  <PersonTip key={login} label={firstName(name)}>
                    <Avatar login={login} name={name} size={19} />
                  </PersonTip>
                )
              })}
            </span>
          </span>
        ) : null}

        {person.needsAttention.length > 0 ? (
          // Straight to the Needs attention page with the engineer filter
          // already set — the count is only useful as a way in, and a
          // reader who has to re-find these six features by hand won't.
          <ShellLink
            page="attention"
            search={{ engineer: person.name }}
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "gap-1.5 no-underline")}
            title={`Show the ${person.needsAttention.length} flagged ${
              person.needsAttention.length === 1 ? "feature" : "features"
            } ${first} owns`}
          >
            <TriangleAlert aria-hidden="true" style={{ color: "var(--status-blocked)" }} />
            <span className="font-mono-data">{person.needsAttention.length}</span>{" "}
            {person.needsAttention.length === 1 ? "feature" : "features"} flagged
          </ShellLink>
        ) : null}
      </div>

      {/* The same figure tiles as Today and This week, six across instead
          of four: inside a card the row has to stay one line deep, or six
          people's worth of it is the whole page. */}
      <StatStrip
        className="sm:grid-cols-3 lg:grid-cols-6"
        stats={[
          { label: "Features owned", value: person.features.length },
          {
            label: "Features shipped",
            value: <OutOf value={person.featuresShipped} of={person.features.length} />,
            color: person.featuresShipped > 0 ? "var(--pr-shipped)" : undefined,
          },
          { label: "Stories", value: person.totals.total },
          {
            label: "Stories shipped",
            value: <OutOf value={person.totals.shipped} of={person.totals.total} />,
            color: person.totals.shipped > 0 ? "var(--pr-shipped)" : undefined,
          },
          {
            label: "Reviews owed",
            value: owed,
            color: owed > 0 ? "var(--status-in-review)" : undefined,
          },
          { label: "Own PRs open", value: person.authored.length },
        ]}
      />

      <Block icon={<CircleDotDashed aria-hidden="true" className="size-3.5" />} title="In flight">
        {work.length === 0 ? (
          <p className="m-0 text-xs text-muted-foreground">Nothing moving right now.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {work.map((entry) => (
              <FeatureWorkRow key={entry.feature.key} entry={entry} detailed={detailed} />
            ))}
          </ul>
        )}
      </Block>

      {owed > 0 ? (
        <Block
          icon={<GitPullRequestArrow aria-hidden="true" className="size-3.5" />}
          title={`Waiting on ${first}`}
        >
          {detailed ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {person.reviewing.map(({ pr, ageDays }) => (
                <li key={`${pr.repo}#${pr.number}`} className="min-w-0">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="row-link flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 no-underline"
                  >
                    <AuthorAvatar pr={pr} />
                    <PrChip pr={pr} asSpan />
                    <span className="min-w-0 flex-1 truncate text-xs">{pr.title}</span>
                    {/* Who else is on it — an approval already sitting there
                        is the difference between "review this" and "this is
                        one click from merging". Their own row is dropped:
                        the block heading already says it's waiting on them. */}
                    <OtherReviewers pr={pr} except={person.login} />
                    <span className="font-mono-data shrink-0 text-xs text-muted-foreground">open {ageDays}d</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
              {person.reviewing.slice(0, 6).map(({ pr, ageDays }) => (
                <li key={`${pr.repo}#${pr.number}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AuthorAvatar pr={pr} />
                  <PrChip pr={pr} />
                  <span className="font-mono-data whitespace-nowrap">open {ageDays}d</span>
                </li>
              ))}
              {person.reviewing.length > 6 ? (
                <li className="self-center text-xs text-muted-foreground">+{person.reviewing.length - 6} more</li>
              ) : null}
            </ul>
          )}
        </Block>
      ) : null}

      {person.features.length > 0 ? (
        <Block icon={<Package aria-hidden="true" className="size-3.5" />} title="Owns">
          {detailed ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {person.features.map((feature) => (
                <li key={feature.key} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <FeatureLink feature={feature} />
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    <StatusPill status={feature.stage} className="text-[11px]" />
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono-data">{feature.stories.length}</span>{" "}
                      {feature.stories.length === 1 ? "story" : "stories"}
                    </span>
                    <span className="font-mono-data w-9 text-right text-xs text-muted-foreground">
                      {feature.dataOk ? `${feature.score}%` : "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
              {person.features.map((feature) => (
                <li key={feature.key} className="flex items-center gap-1.5">
                  <FeatureLink feature={feature} codeOnly />
                  <span className="font-mono-data text-[11px] text-muted-foreground">
                    {feature.dataOk ? `${feature.score}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      ) : null}
    </li>
  )
}

/** "5/9" — the figure, then the total it is out of, set back so the tile
 *  still reads as one number at a glance rather than as a fraction the
 *  reader has to divide. */
function OutOf({ value, of }: { value: number; of: number }) {
  return (
    <>
      {value}
      <span className="text-[15px] text-muted-foreground">/{of}</span>
    </>
  )
}

/**
 * Where this person exists outside the dashboard.
 *
 * Only what config.yaml's `jiraAccounts` / `slackIds` name: neither
 * identity can be derived from anything the pipeline collects (see
 * personLinks), and a guessed URL is worse than no button. No entry, no
 * button — and with no entries at all, no row.
 */
function PersonLinkButtons({ login, name }: { login: string; name: string }) {
  const { epic } = useShell()
  const links = personLinks(epic, login)
  const targets = [
    { key: "jira", href: links.jira, label: `${name} in Jira`, icon: SiJira },
    // Slack's mark isn't in simple-icons' brand set (SiSlack was removed
    // over trademark policy); Font Awesome still carries it.
    { key: "slack", href: links.slack, label: `Message ${name} on Slack`, icon: FaSlack },
  ] as const

  return (
    <span className="flex shrink-0 items-center">
      {targets.map(({ key, href, label, icon: Icon }) =>
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={label}
            aria-label={label}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-muted-foreground")}
          >
            <Icon aria-hidden="true" size={13} />
          </a>
        ) : null,
      )}
    </span>
  )
}

/**
 * One feature's worth of live work: the feature, the stories moving under
 * it, and every open pull request hanging off those stories.
 *
 * Detailed nests all three levels, because that is the thing being read
 * out loud at standup — "F2.3, the export story, PR 412, Vivek has had it
 * two days". Compact keeps it to one line: the feature, its story keys
 * coloured by status, and the PRs.
 *
 * A feature whose PRs hang off the feature ticket itself gets one rung
 * fewer: `isFeatureTicket` splits that pseudo-story out, its status moves
 * up onto the feature row, and its pull requests sit directly under the
 * feature — where JIRA actually put them.
 */
function FeatureWorkRow({ entry, detailed }: { entry: FeatureWork; detailed: boolean }) {
  const { feature, owned, stories } = entry
  const direct = stories.find(({ story }) => isFeatureTicket(story, feature))
  const nested = stories.filter(({ story }) => !isFeatureTicket(story, feature))

  if (!detailed) {
    return (
      // Hanging indent rather than one wrapping row: a feature with five
      // pull requests wraps, and a second line starting back at the left
      // margin reads as another feature rather than more of this one.
      <li className="flex min-w-0 items-start gap-2">
        <FeatureLink feature={feature} codeOnly />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          {direct ? <StatusPill status={direct.story.status} className="shrink-0 text-[11px]" /> : null}
          {nested.map(({ story }) => (
            <StatusPill
              key={story.key}
              status={story.status}
              label={story.key}
              icon={<FileText aria-hidden="true" className="size-3 shrink-0" />}
              className="font-mono-data text-[11px]"
            />
          ))}
          {stories.flatMap(({ prs }) => prs).map(({ pr }) => (
            <PrChip key={`${pr.repo}#${pr.number}`} pr={pr} />
          ))}
        </span>
      </li>
    )
  }

  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <FeatureLink feature={feature} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* A feature they don't own is here because they opened a PR on
              somebody else's story — worth saying whose, or the row reads as
              a feature they forgot they owned. */}
          {!owned ? <span className="text-xs text-muted-foreground">{feature.owner}'s feature</span> : null}
          {direct ? <StatusPill status={direct.story.status} className="text-[11px]" /> : null}
        </span>
      </span>
      <ul className="m-0 ml-[3px] flex list-none flex-col gap-2 border-l-2 border-border-soft p-0 pl-4">
        {direct?.prs.map((work) => (
          <PrWorkRow key={`${work.pr.repo}#${work.pr.number}`} work={work} />
        ))}
        {nested.map(({ story, prs }) => (
          <li key={story.key} className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {/* Key and summary as one link, the way every other ticket on
                  the dashboard reads — the summary is the part worth
                  aiming at, and it used to be the one part that wasn't
                  clickable. */}
              <JiraLink issueKey={story.key} type="story" tone={story.status}>
                <IssueTitle issueKey={story.key} title={summaryFor(story, feature)} />
              </JiraLink>
              <StatusPill status={story.status} className="ml-auto shrink-0 text-[11px]" />
            </span>
            {prs.length > 0 ? (
              <ul className="m-0 ml-[3px] flex list-none flex-col gap-1.5 border-l-2 border-border-soft p-0 pl-4">
                {prs.map((work) => (
                  <PrWorkRow key={`${work.pr.repo}#${work.pr.number}`} work={work} />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * A pull request as it matters at standup: what it is, who is sitting on
 * it, and how long it has been open.
 *
 * The whole row is the link — every part of it (the author, the title, the
 * reviewer faces, the age) is about this one pull request, so all of it
 * opens the pull request rather than only the repo chip it used to hang
 * off. See `.row-link` for how the chip stays lit as the target.
 *
 * The reviewers are the same badges the Reviews page uses, minus the
 * names — a row this deep already carries a ticket key, a repo and a
 * title, and three spelled-out logins on the end of it wraps. Faces
 * survive being small; "VivekMurarkaIndIre" does not.
 */
function PrWorkRow({ work }: { work: PrWork }) {
  const { pr, reviewers, mine, openDays } = work

  return (
    <li className="min-w-0">
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        className="row-link flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 no-underline"
      >
        {/* Only when it isn't theirs: under someone's own name every PR is
            assumed to be theirs, so a face here means "not yours". */}
        {!mine ? <AuthorAvatar pr={pr} /> : null}
        <PrChip pr={pr} asSpan />
        <span className="min-w-0 flex-1 truncate text-xs">{pr.title}</span>
        {reviewers.length === 0 ? (
          <span className="shrink-0 text-xs" style={{ color: "var(--status-in-progress)" }}>
            Needs a reviewer
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5">
            {orderReviewers(reviewers).map((reviewer) => (
              <ReviewerChip key={reviewer.reviewer} status={reviewer} avatarOnly />
            ))}
          </span>
        )}
        <span
          className="font-mono-data shrink-0 text-xs whitespace-nowrap"
          title="Days this pull request has been open"
          style={{ color: openDays > 2 ? "var(--status-in-progress)" : "var(--muted-foreground)" }}
        >
          open {openDays}d
        </span>
      </a>
    </li>
  )
}

/** Everyone on a PR except the person whose card this is — used in the
 *  "waiting on them" block, where their own pending request is the
 *  premise of the block rather than news. */
function OtherReviewers({ pr, except }: { pr: PrRefT; except: string | null }) {
  const others = reviewersForPr(pr).filter((reviewer) => reviewer.reviewer !== except)
  if (others.length === 0) return null

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {orderReviewers(others).map((reviewer) => (
        <ReviewerChip key={reviewer.reviewer} status={reviewer} avatarOnly />
      ))}
    </span>
  )
}

/** The pull request's author, as a face. Named through config.yaml's
 *  people map where there is an entry, so the tooltip and the initials
 *  fallback read as "Vivek" rather than "VivekMurarkaIndIre". */
function AuthorAvatar({ pr }: { pr: PrRefT }) {
  const { epic } = useShell()
  if (!pr.author) return null
  const name = displayNameForLogin(epic, pr.author) ?? pr.author

  return (
    <PersonTip label={`Opened by ${firstName(name)}`} className="shrink-0 items-center">
      <Avatar login={pr.author} name={name} size={19} />
    </PersonTip>
  )
}

/** A single-story feature usually names its story after itself, so the
 *  nested row would print the feature's title again one line below it.
 *  Empty in that case — the ticket key is the useful part. Same rule as
 *  the change feed's own nested rows. */
function summaryFor(story: { summary: string }, feature: FeatureT): string {
  const summary = story.summary.replace(feature.code, "").replace(/^\s*[—–:-]?\s*/, "").trim()
  return summary === featureTitleWithoutCode(feature) ? "" : summary
}

/**
 * Two bars on one track, scaled against the busiest person on the page:
 * what they own, and what is queued on them. Same device as the epic
 * header's segmented bar — a proportion made of parts, never a single
 * fill — so a reader who has learned to read that one already reads this.
 */
function LoadBar({ person, busiest }: { person: PersonLoad; busiest: number }) {
  const owned = (person.features.length / busiest) * 100
  const queued = (person.reviewing.length / busiest) * 100

  return (
    // Deliberately small and set against the row rather than filling it:
    // a full-width saturated bar reads as a progress meter, and this is a
    // comparison between people, not a proportion of anything. The figures
    // below carry the values; this only has to make "who is carrying the
    // most" visible without reading them.
    <div
      className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-md bg-muted"
      role="img"
      aria-label={`${person.features.length} features owned, ${person.reviewing.length} reviews waiting on them`}
    >
      <span className="h-full" style={{ width: `${owned}%`, background: "var(--status-in-progress)" }} />
      <span className="h-full" style={{ width: `${queued}%`, background: "var(--status-in-review)" }} />
    </div>
  )
}

/** The same quote-line rung SinceYesterday uses, so "things belonging to
 *  this person" is drawn the way "things belonging to this change" is. */
function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="eyebrow m-0 flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </p>
      <div className="ml-[3px] border-l-2 border-border-soft pl-4">{children}</div>
    </div>
  )
}

/** The feature's own glyph — the same box every Jira feature link on the
 *  dashboard draws, tinted by stage — rather than a bare status dot, so a
 *  feature reads as a feature here too and not as a generic coloured
 *  bullet.
 *
 *  Code and title are one link, not a link next to a dead label: the title
 *  is the part a reader aims at, and splitting the two left the larger,
 *  more obvious half of the row doing nothing. The link stops at the end
 *  of the title rather than stretching the width of the row — a hover fill
 *  running to the far edge would claim the status pill and the counts
 *  sitting out there, which go somewhere else or nowhere at all.
 *
 *  `codeOnly` is the compact view, where there is no title on the row to
 *  join up with. */
function FeatureLink({ feature, codeOnly }: { feature: FeatureT; codeOnly?: boolean }) {
  return (
    <ShellLink
      page="feature"
      code={featureSlug(feature.code)}
      className={cn(
        "hover-fill inline-flex items-center gap-1.5 no-underline",
        codeOnly ? "shrink-0" : "min-w-0",
      )}
      title={feature.title}
    >
      <Package aria-hidden="true" data-status-icon={feature.stage} className="size-3.5 shrink-0" />
      {codeOnly ? (
        <span className="font-mono-data text-[13px]">{feature.code}</span>
      ) : (
        <span className="min-w-0 truncate text-sm">
          <IssueTitle issueKey={feature.code} title={featureTitleWithoutCode(feature)} />
        </span>
      )}
    </ShellLink>
  )
}
