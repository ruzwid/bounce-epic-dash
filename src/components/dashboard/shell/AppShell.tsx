import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ShellProvider, type ShellValue } from "./ShellContext"
import { Sidebar } from "./Sidebar"
import { EpicHeader } from "./EpicHeader"

type AppShellProps = {
  value: ShellValue
  children: React.ReactNode
}

/**
 * Two columns that never scroll together: a fixed rail on the left and one
 * scrolling content column on the right, with the epic header sticky
 * inside it. Below `lg` the rail becomes a drawer over the content — the
 * rail is a navigational aid, and a 264px column is most of a phone.
 */
export function AppShell({ value, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Escape closes it, and focus follows it in and back out again. Opening a
  // drawer over the page without moving focus leaves a keyboard or screen
  // reader user still on the hamburger, reading a page that is now behind an
  // overlay; closing it without putting focus back leaves them at the top of
  // the document. The `contains` check is what makes the restore safe: if
  // focus has already moved somewhere outside the rail (the reader tabbed
  // out, or the drawer is unmounting) nothing gets yanked.
  useEffect(() => {
    if (!drawerOpen) return
    // Captured, not read again in the cleanup: a ref can point at a
    // different node by the time cleanup runs.
    const drawer = drawerRef.current
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    drawer?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      if (drawer?.contains(document.activeElement)) returnFocusRef.current?.focus()
    }
  }, [drawerOpen])

  return (
    // One tooltip provider for the whole shell: a shared delay means
    // moving along a row of avatar badges shows the second one instantly
    // rather than waiting out the open delay again on every face.
    <ShellProvider value={value}>
      <TooltipProvider delay={250} closeDelay={80}>
        <a
          href="#main"
          className="sr-only rounded-4xl bg-card px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>

        <div className="flex h-dvh overflow-hidden">
          {/* Backdrop is drawer-only: on `lg` the rail is part of the layout,
              so there is nothing to dismiss. */}
          <div
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
            className={cn(
              "fixed inset-0 z-40 bg-foreground/25 transition-opacity duration-200 ease-[var(--ease-out)] lg:hidden",
              drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />

          {/* `invisible` when closed, not just translated off-screen: a
              transform moves the rail out of sight but leaves every link in
              it in the tab order and in the accessibility tree, so on a
              phone the first thirty-odd tab stops were a sidebar nobody
              could see. `visibility` is transitionable and holds its old
              value until the transition ends, so adding it to the property
              list hides the rail *after* it has finished sliding out rather
              than snapping it away mid-slide. On `lg` it is part of the
              layout again and always visible. */}
          <aside
            ref={drawerRef}
            tabIndex={-1}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[264px] shrink-0 border-r border-border bg-sidebar",
              "transition-[transform,visibility] duration-[250ms] ease-[var(--ease-out)]",
              "lg:static lg:visible lg:translate-x-0",
              drawerOpen ? "visible translate-x-0" : "invisible -translate-x-full",
            )}
          >
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>

          <main id="main" className="flex-1 overflow-y-auto">
            <EpicHeader onOpenSidebar={() => setDrawerOpen(true)} />
            <div className="page-wrap pt-7 pb-24">{children}</div>
          </main>
        </div>
      </TooltipProvider>
    </ShellProvider>
  )
}
