import { ChevronsUpDown, Check } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { EPICS, epicTitle } from "@/lib/dashboard/appConfig"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useShell } from "./ShellContext"

/**
 * Which epic you're reading, and how to get to another one.
 *
 * Rendered as plain text with a chevron rather than a button-shaped
 * control: with one epic configured this is just the title at the top of
 * the rail, exactly as it read before the dashboard tracked more than one,
 * and the affordance only earns its pixels once there is somewhere to go.
 *
 * Switching always lands on the target epic's *latest* snapshot, never on
 * the date currently being viewed. Dates don't correspond across epics —
 * two teams collect on their own schedules — so carrying "2026-08-14"
 * across would as often as not land on a 404, and when it didn't it would
 * silently show a day chosen for a different reason.
 */
export function EpicSwitcher() {
  const { epic, snapshot } = useShell()
  // The live JIRA summary as of this snapshot, in preference to the
  // config's copy of it — same rule the rest of the shell follows.
  const current = snapshot.epic.title || epicTitle(epic)

  if (EPICS.length <= 1) {
    return <span className="font-display truncate text-[17px] text-foreground">{current}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Switch epic"
            className="nav-item -mx-1.5 flex min-w-0 items-center gap-1.5 rounded-4xl px-1.5 py-0.5 text-left"
          >
            <span className="font-display truncate text-[17px] text-foreground">{current}</span>
            <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 opacity-50" />
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {EPICS.map((slug) => (
          // Tick on the right, in the same column FilterMenu's checked
          // items use (DropdownMenuRadioItem) — the two dropdowns in this
          // app should mark "this is the current one" the same way.
          // Nothing marks the current epic other than the tick: a
          // background tint here would compete with the hover/keyboard
          // highlight, so the row you're pointing at and the row you're on
          // would look alike.
          <DropdownMenuItem
            key={slug}
            className="pr-8"
            render={
              <Link to="/$epic/{-$date}" params={{ epic: slug }}>
                {epicTitle(slug)}
                {slug === epic ? (
                  <Check aria-hidden="true" className="absolute right-2.5 size-3.5 shrink-0" />
                ) : null}
              </Link>
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
