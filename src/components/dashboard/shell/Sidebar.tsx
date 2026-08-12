import { GitPullRequestArrow, LayoutGrid, Settings2, TriangleAlert } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { attentionFeatures, featureSlug, sidebarGroups } from "@/lib/dashboard/nav"
import { cn } from "@/lib/utils"
import ThemeToggle from "@/components/ThemeToggle"
import { useShell } from "./ShellContext"
import { ShellLink } from "./ShellLink"

type FeatureT = z.infer<typeof FeatureSchema>

const ACTIVE = { "data-active": "true" }

/** Feature titles arrive from JIRA already prefixed with their own code
 *  ("F1.1 — Excel Template…"). The rail shows the code in its own column,
 *  so strip the duplicate rather than rendering it twice in 264px. */
function titleWithoutCode(feature: FeatureT): string {
  const escaped = feature.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return feature.title.replace(new RegExp(`^\\s*${escaped}\\s*[—–:-]?\\s*`), "").trim() || feature.title
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { snapshot, now } = useShell()
  const groups = sidebarGroups(snapshot)
  const attentionCount = attentionFeatures(snapshot, now).length
  const reviewCount = snapshot.reviewQueue.length

  return (
    // onClick lives on the container, not on each link: it closes the
    // mobile drawer after any navigation, and putting it here means a link
    // added later can't forget to wire it up.
    <nav
      aria-label="Dashboard sections"
      onClick={onNavigate}
      className="flex h-full flex-col overflow-y-auto overscroll-contain pb-4"
    >
      <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="font-display flex size-6 items-center justify-center rounded-md bg-foreground text-[13px] leading-none text-background"
          >
            b
          </span>
          <span className="font-display truncate text-[17px]">{snapshot.epic.title}</span>
        </div>
        <span className="font-mono-data pl-[34px] text-[11px] text-muted-foreground">
          {snapshot.epic.key} · epic
        </span>
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
      </ul>

      {groups.map((group) => (
        <div key={group.id} className="flex flex-col">
          <h2 className="eyebrow m-0 px-6 pt-3 pb-1.5 font-normal">{group.label}</h2>
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
                    className="size-[7px] shrink-0 rounded-full"
                  />
                  <span className="font-mono-data shrink-0 text-[11.5px] text-muted-foreground">{feature.code}</span>
                  <span className="flex-1 truncate">{titleWithoutCode(feature)}</span>
                  <span className="font-mono-data shrink-0 text-[11.5px] text-muted-foreground">
                    {feature.dataOk ? `${feature.score}%` : "—"}
                  </span>
                </ShellLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

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
  "nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/85 no-underline"

function CountBadge({ value, tone }: { value: number; tone: "warn" | "neutral" }) {
  return (
    <span
      data-status={tone === "warn" ? "in_progress" : undefined}
      className={cn(
        "font-mono-data shrink-0 rounded-md px-1.5 py-0.5 text-[11px]",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  )
}
