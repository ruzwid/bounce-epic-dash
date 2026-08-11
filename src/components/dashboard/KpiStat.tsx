import { cn } from "@/lib/utils"

type KpiStatProps = {
  label: string
  value: number | string
  sublabel?: string
  className?: string
}

export function KpiStat({ label, value, sublabel, className }: KpiStatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono-data text-3xl font-semibold tabular-nums sm:text-4xl">{value}</span>
      <span className="text-xs text-muted-foreground">
        {label}
        {sublabel ? <span className="ml-1.5 text-muted-foreground/80">({sublabel})</span> : null}
      </span>
    </div>
  )
}
