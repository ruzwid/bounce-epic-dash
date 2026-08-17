import {
  BadgeCheck,
  CalendarRange,
  ChevronRight,
  GitPullRequestArrow,
  LayoutGrid,
  Ruler,
  Settings2,
  TriangleAlert,
  Users,
} from "lucide-react"
import {
  attentionFeatures,
  epicStage,
  featureSlug,
  featureTitleWithoutCode,
  milestoneProgress,
  sidebarGroups,
} from "@/lib/dashboard/nav"
import { cn } from "@/lib/utils"
import ThemeToggle from "@/components/ThemeToggle"
import { MilestoneGroupHeading } from "../MilestoneGroupHeading"
import { JiraLink } from "../JiraLink"
import { EpicSwitcher } from "./EpicSwitcher"
import { useShell } from "./ShellContext"
import { ShellLink } from "./ShellLink"

const ACTIVE = { "data-active": "true" }

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { epic, snapshot, asOf } = useShell()
  const groups = sidebarGroups(snapshot)
  const attentionCount = attentionFeatures(snapshot, asOf).length
  const reviewCount = snapshot.reviewQueue.length
  // Only the count that means somebody owes an answer right now —
  // signed-off features are history, not a queue.
  const awaitingCount = snapshot.features.filter((f) => f.awaitingSignOff).length

  return (
    // onClick lives on the container, not on each link: it closes the
    // mobile drawer after any navigation, and putting it here means a link
    // added later can't forget to wire it up.
    <nav
      aria-label="Dashboard sections"
      onClick={onNavigate}
      className="flex h-full flex-col overflow-y-auto overscroll-contain pb-4"
    >
      {/* The epic's name is the switcher when there's more than one epic
          to switch to, and plain text when there isn't. Its Jira link
          moves down to the key line below, which is where the key —
          and therefore the thing being linked — actually is. */}
      <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
        <EpicSwitcher />
        <JiraLink
          issueKey={snapshot.epic.key}
          type="epic"
          tone={epicStage(snapshot)}
          className="font-mono-data gap-1.5 text-[11px] text-muted-foreground"
          iconClassName="size-3"
        >
          {snapshot.epic.key} · epic
        </JiraLink>
      </div>

      <ul className="flex list-none flex-col gap-0.5 px-3 pb-2.5">
        <li>
          <ShellLink page="today" className={rowClass} activeProps={ACTIVE}>
            <LayoutGrid aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">Today</span>
          </ShellLink>
        </li>
        <li>
          <ShellLink page="attention" className={rowClass} activeProps={ACTIVE}>
            <TriangleAlert aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">Needs attention</span>
            {attentionCount > 0 ? <CountBadge value={attentionCount} tone="warn" /> : null}
          </ShellLink>
        </li>
        <li>
          <ShellLink page="reviews" className={rowClass} activeProps={ACTIVE}>
            <GitPullRequestArrow aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">Reviews</span>
            {reviewCount > 0 ? <CountBadge value={reviewCount} tone="neutral" /> : null}
          </ShellLink>
        </li>
        <li>
          <ShellLink page="people" className={rowClass} activeProps={ACTIVE}>
            <Users aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">People</span>
          </ShellLink>
        </li>
        <li>
          <ShellLink page="signoff" className={rowClass} activeProps={ACTIVE}>
            <BadgeCheck aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">Sign-off</span>
            {awaitingCount > 0 ? <CountBadge value={awaitingCount} tone="product" /> : null}
          </ShellLink>
        </li>
      </ul>

      {/* A second group, ruled off: the three pages above answer "what is
          happening now", these two answer "what happened over time". The
          rule is the only thing saying so — labelling the groups would
          cost two more lines of chrome in a 264px rail. */}
      <ul className="mt-1 flex list-none flex-col gap-0.5 border-t border-border-soft px-3 pt-2.5 pb-2.5">
        <li>
          <ShellLink page="week" className={rowClass} activeProps={ACTIVE}>
            <CalendarRange aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">This week</span>
          </ShellLink>
        </li>
        <li>
          <ShellLink page="scope" className={rowClass} activeProps={ACTIVE}>
            <Ruler aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
            <span className="flex-1 truncate">Scope</span>
          </ShellLink>
        </li>
      </ul>

      {groups.map((group) => {
        // Same rule as Today's milestone sections: nothing left to act on
        // in a done milestone, so it starts collapsed — but the value is
        // stable across re-renders, so expanding one by hand never gets
        // reverted mid-session.
        const isDone = milestoneProgress(epic, group.features).stage === "done"
        return (
          <details key={group.id} className="group flex flex-col" open={!isDone}>
            <summary className="m-0 flex cursor-pointer list-none items-center gap-1.5 px-6 pt-3 pb-1.5 text-[11px] font-normal tracking-[0.09em] text-muted-foreground uppercase select-none [&::-webkit-details-marker]:hidden">
              <MilestoneGroupHeading group={group} className="hover-fill min-w-0 flex-1 truncate no-underline" />
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90"
              />
            </summary>
            <ul className="flex list-none flex-col gap-px px-3">
              {group.features.map((feature) => (
                <li key={feature.key}>
                  <ShellLink
                    page="feature"
                    code={featureSlug(feature.code)}
                    className={cn(rowClass, "text-[13.5px]")}
                    activeProps={ACTIVE}
                    title={feature.title}
                  >
                    <span
                      aria-hidden="true"
                      data-status-dot={feature.stage}
                      className="size-3.5 shrink-0 rounded-full"
                    />
                    <span className="font-mono-data shrink-0 text-xs text-muted-foreground">{feature.code}</span>
                    <span className="flex-1 truncate">{featureTitleWithoutCode(feature)}</span>
                    <span className="font-mono-data shrink-0 text-[11.5px] text-muted-foreground">
                      {feature.dataOk ? `${feature.score}%` : "—"}
                    </span>
                  </ShellLink>
                </li>
              ))}
            </ul>
          </details>
        )
      })}

      <div className="flex-1" />

      <div className="mt-4 flex flex-col gap-0.5 border-t border-border-soft px-3 pt-3">
        <ShellLink page="config" className={rowClass} activeProps={ACTIVE}>
          <Settings2 aria-hidden="true" className="size-[15px] shrink-0 opacity-70" />
          <span className="flex-1 truncate">Config</span>
        </ShellLink>
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <span className="font-mono-data text-[11px] text-muted-foreground">{snapshot.date}</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

const rowClass =
  "nav-item flex items-center gap-2.5 rounded-4xl px-2.5 py-2 text-sm text-foreground/85 no-underline"

/** `neutral` is the plain queue count (reviews waiting). `warn` and
 *  `product` borrow a status hue: the second so the sign-off queue reads
 *  as the *product* gate rather than as another engineering one — the
 *  same pink the Today sentence and the sign-off pipeline use. */
function CountBadge({ value, tone }: { value: number; tone: "warn" | "neutral" | "product" }) {
  return (
    <span
      data-status={tone === "warn" ? "in_progress" : tone === "product" ? "with_product" : undefined}
      className={cn(
        "font-mono-data shrink-0 rounded-4xl px-1.5 py-0.5 text-[11px]",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  )
}
