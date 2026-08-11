import type { z } from "zod";
import type { Subtask as SubtaskSchema } from "@/lib/schema"
import { StatusPill } from "./StatusPill"

type SubtaskT = z.infer<typeof SubtaskSchema>

type SubtaskTableProps = {
  subtasks: SubtaskT[]
}

/**
 * Ticket / summary / status pill / PR link. A real <table> for
 * accessibility; below `sm` each row restacks into a labeled card (see
 * `.responsive-table` in styles.css) — no horizontal scroll at 380px.
 */
export function SubtaskTable({ subtasks }: SubtaskTableProps) {
  return (
    <table className="responsive-table w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-1.5 pr-3 font-medium">Ticket</th>
          <th className="py-1.5 pr-3 font-medium">Summary</th>
          <th className="py-1.5 pr-3 font-medium">Status</th>
          <th className="py-1.5 font-medium">PRs</th>
        </tr>
      </thead>
      <tbody>
        {subtasks.map((subtask) => (
          <tr key={subtask.key} className="border-b border-border last:border-0">
            <td data-label="Ticket" className="font-mono-data py-1.5 pr-3 whitespace-nowrap">{subtask.key}</td>
            <td data-label="Summary" className="py-1.5 pr-3">{subtask.summary}</td>
            <td data-label="Status" className="py-1.5 pr-3">
              <StatusPill status={subtask.status} />
            </td>
            <td data-label="PRs" className="py-1.5">
              {subtask.prs.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="inline-flex flex-wrap gap-2">
                  {subtask.prs.map((pr) => (
                    <a
                      key={`${pr.repo}#${pr.number}`}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono-data underline"
                    >
                      {pr.repo}#{pr.number}
                    </a>
                  ))}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
