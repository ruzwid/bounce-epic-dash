import type { z } from "zod";
import { ChevronRight } from "lucide-react"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { cn } from "@/lib/utils"
import { StatusPill } from "./StatusPill"
import { ScoreBar } from "./ScoreBar"
import { Callout } from "./Callout"
import { EmptyState } from "./EmptyState"
import { AcCoverageSummary } from "./AcCoverageSummary"
import { ReleaseGateLine } from "./ReleaseGateLine"
import { SubtaskTable } from "./SubtaskTable"
import { OverrideNote } from "./OverrideNote"

type FeatureT = z.infer<typeof FeatureSchema>

type FeatureCardProps = {
  feature: FeatureT
  previousFeature: FeatureT | null
  tier: "full" | "light"
}

const CONFIDENCE_LABEL: Record<FeatureT["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
}

export function FeatureCard({ feature, previousFeature, tier }: FeatureCardProps) {
  const isCondensed = tier === "light"

  if (!feature.dataOk) {
    return (
      <div className={cn("surface-card rounded-xl border border-border bg-card p-4", isCondensed ? "sm:p-3" : "sm:p-5")}>
        <CardTitleRow feature={feature} />
        <EmptyState message="Data unavailable for this feature — a collection error affected it. See the notice above." className="mt-3" />
      </div>
    )
  }

  const allShippedToDefault = feature.subtasks.length > 0 && feature.subtasks.every((s) => s.status === "shipped")
  const scoreDelta = previousFeature ? feature.score - previousFeature.score : null

  return (
    <div
      className={cn(
        "surface-card flex flex-col gap-3 rounded-xl border border-border bg-card p-4",
        isCondensed ? "sm:p-3" : "sm:p-5",
      )}
    >
      <CardTitleRow feature={feature} />

      <div className="flex flex-col gap-1">
        <ScoreBar score={feature.score} allShippedToDefault={allShippedToDefault} />
        {scoreDelta !== null ? (
          <span className="font-mono-data text-xs text-muted-foreground">
            {scoreDelta === 0 ? "= no change" : scoreDelta > 0 ? `▲ ${scoreDelta} pts` : `▼ ${Math.abs(scoreDelta)} pts`}
            {" vs. previous snapshot"}
          </span>
        ) : null}
      </div>

      <p className="m-0 text-sm">
        <span className="mr-1.5 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {CONFIDENCE_LABEL[feature.confidence]}
        </span>
        {feature.rationale}
      </p>

      <div className="flex flex-col gap-1">
        {feature.callouts.length === 0 ? (
          <EmptyState message="No open callouts — nothing to flag." />
        ) : (
          feature.callouts.map((callout, i) => <Callout key={i} callout={callout} />)
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Last activity:{" "}
          <span className="font-mono-data">
            {feature.daysSinceLastActivity === null ? "unknown" : `${feature.daysSinceLastActivity}d ago`}
          </span>
        </span>
        {feature.daysInStaged !== null ? (
          <span>
            Staged for <span className="font-mono-data">{feature.daysInStaged}d</span>
          </span>
        ) : null}
        <AcCoverageSummary acCoverage={feature.acCoverage} />
      </div>

      <ReleaseGateLine releaseGate={feature.releaseGate} />

      {feature.override ? <OverrideNote override={feature.override} /> : null}

      <details className="group text-sm">
        <summary className="inline-flex list-none cursor-pointer items-center gap-1 rounded-lg text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90" />
          {feature.subtasks.length} subtask{feature.subtasks.length === 1 ? "" : "s"}
        </summary>
        <div className="mt-2">
          <SubtaskTable subtasks={feature.subtasks} />
        </div>
      </details>
    </div>
  )
}

function CardTitleRow({ feature }: { feature: FeatureT }) {
  // feature.title is the live JIRA summary, which by this org's convention
  // already starts with the code ("F1.1 — Excel Template..."). Render it
  // as-is rather than re-prepending feature.code, which would duplicate
  // it — feature.code still appears on its own next to the ticket key.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="m-0 text-base font-semibold">{feature.title}</h3>
      <StatusPill status={feature.stage} />
      {feature.scoreBasis.blocked > 0 ? (
        <StatusPill status="blocked" label={`${feature.scoreBasis.blocked} blocked`} />
      ) : null}
      <span className="font-mono-data ml-auto text-xs text-muted-foreground">
        {feature.code} · {feature.key}
      </span>
      <span className="text-xs text-muted-foreground">{feature.owner}</span>
    </div>
  )
}
