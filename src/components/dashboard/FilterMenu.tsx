import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const ALL = "__all__"

/**
 * Single-select filter (reviewer, author, engineer). Built on DropdownMenu
 * rather than Select so it matches the sizing/border/spacing of the page's
 * other dropdowns (e.g. the Copy button) instead of looking like a native
 * combobox next to them.
 */
export function FilterMenu({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  align = "end",
}: {
  /** Shown on the trigger when nothing is selected, and as the "clear" item. */
  label: string
  value: string | null
  options: string[]
  onChange: (value: string | null) => void
  ariaLabel: string
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label={ariaLabel}>
            <span className="max-w-40 truncate">{value ?? label}</span>
            <ChevronDown aria-hidden="true" className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align={align}>
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={(next) => onChange(next === ALL ? null : (next as string))}
        >
          <DropdownMenuRadioItem value={ALL}>{label}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
