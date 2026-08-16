import type { z } from "zod";
import type { ReviewRequest as ReviewRequestSchema } from "@/lib/schema"
import { EmptyState } from "./EmptyState"

type ReviewRequestT = z.infer<typeof ReviewRequestSchema>

type ReviewQueueTableProps = {
  reviewQueue: ReviewRequestT[]
}

export function ReviewQueueTable({ reviewQueue }: ReviewQueueTableProps) {
  if (reviewQueue.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Review queue</h2>
        <EmptyState message="Nothing waiting on review." />
      </section>
    )
  }

  const sorted = [...reviewQueue].sort((a, b) => b.ageDays - a.ageDays)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Review queue</h2>
      <table className="responsive-table w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">PR</th>
            <th className="py-1.5 pr-3 font-medium">Feature</th>
            <th className="py-1.5 pr-3 font-medium">Reviewer</th>
            <th className="py-1.5 font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((review) => (
            <tr key={`${review.pr.repo}-${review.pr.number}-${review.reviewer}`} className="border-b border-border last:border-0">
              <td data-label="PR" className="py-1.5 pr-3">
                <a href={review.pr.url} target="_blank" rel="noreferrer" className="font-mono-data underline">
                  {review.pr.repo}#{review.pr.number}
                </a>
              </td>
              <td data-label="Feature" className="font-mono-data py-1.5 pr-3">{review.featureKey ?? "—"}</td>
              <td data-label="Reviewer" className="py-1.5 pr-3">{review.reviewer}</td>
              <td data-label="Open for" className="font-mono-data py-1.5">{review.ageDays}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
