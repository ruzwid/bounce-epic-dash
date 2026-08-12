import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
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

  useEffect(() => {
    if (!drawerOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [drawerOpen])

  return (
    <ShellProvider value={value}>
      <a
        href="#main"
        className="sr-only rounded-lg bg-card px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
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

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[264px] shrink-0 border-r border-border bg-sidebar",
            "transition-transform duration-[250ms] ease-[var(--ease-out)]",
            "lg:static lg:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>

        <main id="main" className="flex-1 overflow-y-auto">
          <EpicHeader onOpenSidebar={() => setDrawerOpen(true)} />
          <div className="page-wrap pt-7 pb-24">{children}</div>
        </main>
      </div>
    </ShellProvider>
  )
}
