// src/lib/dashboard/prTone.ts
import type { z } from "zod"
import type { PrRef as PrRefSchema } from "@/lib/schema"

type PrRefT = z.infer<typeof PrRefSchema>

export type PrTone = "shipped" | "staged" | "open" | "draft" | "closed"

/**
 * A merged PR is drawn in two different colours here, and that is the
 * point: green only when it landed on the repo's default branch, gold when
 * it merged into an integration branch instead. GitHub itself shows both
 * as "merged", which is exactly the conflation this dashboard exists to
 * undo — so the icon matches GitHub, and the colour tells the truth.
 */
export function prTone(pr: PrRefT): PrTone {
  if (pr.state === "MERGED") return pr.shippedToDefault ? "shipped" : "staged"
  if (pr.state === "CLOSED") return "closed"
  return pr.isDraft ? "draft" : "open"
}
