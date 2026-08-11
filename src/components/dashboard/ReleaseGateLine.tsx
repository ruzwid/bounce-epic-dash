import type { z } from "zod";
import type { ReleaseGate as ReleaseGateSchema } from "@/lib/schema"

type ReleaseGateT = z.infer<typeof ReleaseGateSchema>

type ReleaseGateLineProps = {
  releaseGate: ReleaseGateT | null
}

const STATUS_TEXT: Record<ReleaseGateT["status"], string> = {
  open: "release PR open",
  merged: "release PR merged",
  not_found: "no release PR found",
}

/** A feature with nothing staged simply has no release gate — that's not
 *  an empty state, it's the absence of a fact that doesn't apply yet, so
 *  this renders nothing rather than an EmptyState. */
export function ReleaseGateLine({ releaseGate }: ReleaseGateLineProps) {
  if (!releaseGate) return null

  return (
    <p className="text-sm text-muted-foreground">
      Release gate:{" "}
      <span className="font-mono-data">{releaseGate.integrationBranch}</span> →{" "}
      {releaseGate.pr ? (
        <a href={releaseGate.pr.url} target="_blank" rel="noreferrer" className="underline">
          {STATUS_TEXT[releaseGate.status]}
        </a>
      ) : (
        <span>{STATUS_TEXT[releaseGate.status]}</span>
      )}
      {releaseGate.status === "not_found" ? (
        <span className="ml-1">— never assumed shipped.</span>
      ) : null}
    </p>
  )
}
