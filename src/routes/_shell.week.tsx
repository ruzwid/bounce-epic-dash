import { createFileRoute } from '@tanstack/react-router'
import { loadLatestSnapshot, loadSnapshotDaysBefore } from '@/lib/dashboard/snapshots'
import { WeekPage } from '@/components/dashboard/pages/WeekPage'

// The one comparison this page needs that the shell doesn't already load:
// a full snapshot from a week back. Loaded here rather than in the shell
// so the other seven pages don't carry it in their prerendered HTML.
export const Route = createFileRoute('/_shell/week')({
  loader: async () => {
    const latest = await loadLatestSnapshot()
    return { past: await loadSnapshotDaysBefore(latest.date, 7) }
  },
  head: () => ({ meta: [{ title: 'This week — WPP at Scale' }] }),
  component: WeekRoute,
})

function WeekRoute() {
  const { past } = Route.useLoaderData()
  return <WeekPage past={past} />
}
