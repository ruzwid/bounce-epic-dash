import { useEffect, useRef } from "react"
import type { DashboardSearch } from "@/lib/dashboard/search"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { FilterMenu } from "./FilterMenu"

type FilterBarProps = {
  search: DashboardSearch
  onSearchChange: (updates: Partial<DashboardSearch>) => void
  /** Distinct owners present in *this* snapshot — never a hardcoded list. */
  engineers: string[]
}

/**
 * Sticky filter bar. All state is owned by the URL (goal: "Filters are
 * URL state") — this component only reads/writes via props, the actual
 * route wires `search`/`onSearchChange` to `Route.useSearch()`/`navigate`.
 */
export function FilterBar({ search, onSearchChange, engineers }: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/") return
      const active = document.activeElement
      // Only a genuine text-entry context should swallow "/" — a real
      // <input>/<textarea>, or a contenteditable. NOT a filter button/menu:
      // those have no text entry of their own, and pressing "/" there
      // should still jump focus to the search input.
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      if (isTyping) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-y border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:mx-0 sm:rounded-4xl sm:border-x">
      <ToggleGroup
        value={[search.milestone]}
        onValueChange={(value) => onSearchChange({ milestone: (value[0] as DashboardSearch["milestone"]) ?? "all" })}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="m1">M1</ToggleGroupItem>
        <ToggleGroupItem value="m2">M2</ToggleGroupItem>
        <ToggleGroupItem value="m3-m4">M3–M4</ToggleGroupItem>
      </ToggleGroup>

      <FilterMenu
        label="All engineers"
        value={search.engineer}
        options={engineers}
        onChange={(engineer) => onSearchChange({ engineer })}
        ariaLabel="Filter by engineer"
        align="start"
      />

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={search.needsAttention}
          onCheckedChange={(checked) => onSearchChange({ needsAttention: checked })}
        />
        Needs attention only
      </label>

      <div className="ml-auto min-w-0 flex-1 sm:max-w-56">
        <Input
          ref={inputRef}
          type="search"
          placeholder="Filter features… (press /)"
          value={search.q}
          onChange={(event) => onSearchChange({ q: event.target.value })}
          aria-label="Filter features by text"
        />
      </div>
    </div>
  )
}
