import { createFileRoute } from '@tanstack/react-router'
import { latestSnapshotDate, loadSnapshotDaysBefore } from '@/lib/dashboard/snapshots'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { WeekPage } from '@/components/dashboard/pages/WeekPage'

// The one comparison this page needs that the shell doesn't already load:
// a full snapshot from a week back. Loaded here rather than in the shell
// so the other seven pages don't carry it in their prerendered HTML.
export const Route = createFileRoute('/$epic/{-$date}/week')({
  loader: async ({ params }) => {
    // "A week before what" is the date in the URL, or the newest snapshot
    // when there isn't one. Read off the file listing rather than by
    // loading the latest snapshot for its `date` field — the only thing
    // wanted here is the date, and loading it would pull a whole snapshot
    // through the parser to read twelve bytes off it.
    const anchor = params.date ?? latestSnapshotDate(params.epic)
    // No snapshots at all for this epic yet — the shell renders its own
    // "not collected yet" state and this page never mounts.
    if (!anchor) return { past: null }
    return { past: await loadSnapshotDaysBefore(params.epic, anchor, 7) }
  },
  head: ({ params }) => ({ meta: [{ title: pageTitle('This week', params.epic, params.date) }] }),
  component: WeekRoute,
})

function WeekRoute() {
  const { past } = Route.useLoaderData()
  return <WeekPage past={past} />
}
