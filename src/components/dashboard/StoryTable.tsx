import type { z } from "zod";
import type { Story as StorySchema } from "@/lib/schema"
import { storyPrs } from "@/lib/stories"
import { StatusPill } from "./StatusPill"
import { JiraLink } from "./JiraLink"

type StoryT = z.infer<typeof StorySchema>

type StoryTableProps = {
  stories: StoryT[]
}

/**
 * Ticket / summary / status pill / PR link. A real <table> for
 * accessibility; below `sm` each row restacks into a labeled card (see
 * `.responsive-table` in styles.css) — no horizontal scroll at 380px.
 */
export function StoryTable({ stories }: StoryTableProps) {
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
        {stories.map((story) => (
          <tr key={story.key} className="border-b border-border last:border-0">
            <td data-label="Ticket" className="font-mono-data py-1.5 pr-3 align-middle whitespace-nowrap">
              <JiraLink issueKey={story.key} type="story" tone={story.status} className="gap-1">
                {story.key}
              </JiraLink>
            </td>
            <td data-label="Summary" className="py-1.5 pr-3 align-middle">{story.summary}</td>
            <td data-label="Status" className="py-1.5 pr-3 align-middle">
              <StatusPill status={story.status} />
            </td>
            <td data-label="PRs" className="py-1.5 align-middle">
              {storyPrs(story).length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="inline-flex flex-wrap gap-2">
                  {storyPrs(story).map((pr) => (
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
