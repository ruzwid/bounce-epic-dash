import type { z } from "zod";
import type { AcCoverage as AcCoverageSchema } from "@/lib/schema"

type AcCoverageT = z.infer<typeof AcCoverageSchema>

type AcCoverageSummaryProps = {
  acCoverage: AcCoverageT[]
}

/** "7/9 covered · 1 partial · 1 no signal" — never the AC bullet text
 *  itself (that's judge-only input, never published verbatim). */
export function AcCoverageSummary({ acCoverage }: AcCoverageSummaryProps) {
  if (acCoverage.length === 0) {
    return <span className="text-sm text-muted-foreground">No acceptance criteria tracked.</span>
  }

  const covered = acCoverage.filter((c) => c.coverage === "covered").length
  const partial = acCoverage.filter((c) => c.coverage === "partial").length
  const noSignal = acCoverage.filter((c) => c.coverage === "no_signal").length
  const total = acCoverage.length

  const parts = [`${covered}/${total} covered`]
  if (partial > 0) parts.push(`${partial} partial`)
  if (noSignal > 0) parts.push(`${noSignal} no signal`)

  return <span className="font-mono-data text-sm text-muted-foreground">{parts.join(" · ")}</span>
}
