import { createFileRoute } from '@tanstack/react-router'
import { loadLatestSnapshot, loadSnapshotDaysBefore } from '@/lib/dashboard/snapshots'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { WeekPage } from '@/components/dashboard/pages/WeekPage'

// The one comparison this page needs that the shell doesn't already load:
// a full snapshot from a week back. Loaded here rather than in the shell
// so the other seven pages don't carry it in their prerendered HTML.
export const Route = createFileRoute('/$epic/_shell/week')({
  loader: async ({ params }) => {
    const latest = await loadLatestSnapshot(params.epic)
    // No snapshots at all for this epic yet — the shell renders its own
    // "not collected yet" state and this page never mounts.
    if (!latest) return { past: null }
    return { past: await loadSnapshotDaysBefore(params.epic, latest.date, 7) }
  },
  head: ({ params }) => ({ meta: [{ title: `This week — ${epicTitle(params.epic)}` }] }),
  component: WeekRoute,
})

function WeekRoute() {
  const { past } = Route.useLoaderData()
  return <WeekPage past={past} />
}
