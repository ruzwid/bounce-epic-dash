import { createFileRoute } from '@tanstack/react-router'
import { loadSnapshotDaysBefore } from '@/lib/dashboard/snapshots'
import { WeekPage } from '@/components/dashboard/pages/WeekPage'

export const Route = createFileRoute('/$epic/$date/week')({
  loader: async ({ params }) => ({ past: await loadSnapshotDaysBefore(params.epic, params.date, 7) }),
  component: WeekRoute,
})

function WeekRoute() {
  const { past } = Route.useLoaderData()
  return <WeekPage past={past} />
}
