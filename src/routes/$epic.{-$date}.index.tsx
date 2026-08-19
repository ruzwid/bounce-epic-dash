import { createFileRoute } from '@tanstack/react-router'
import { latestSnapshotDate, loadHistory, loadPreviousSnapshot } from '@/lib/dashboard/snapshots'
import { TodayPage } from '@/components/dashboard/pages/TodayPage'

// Today is the one page that reads the previous snapshot in full: its
// change feed diffs the two story by story, and its scope note compares
// the feature and story sets. The shell above carries only a summary of
// that snapshot (see loadPreviousSummary), so the whole thing is loaded
// here — on the single page that uses it — rather than on all eleven.
//
// The burn-up chart's history lands here for the same reason.
export const Route = createFileRoute('/$epic/{-$date}/')({
  loader: async ({ params }) => {
    // The snapshot being viewed, which for the undated URL is whichever is
    // newest. Read off the file listing rather than by loading it: the
    // shell has already loaded that snapshot, and all that's wanted here
    // is the date to step back from.
    const date = params.date ?? latestSnapshotDate(params.epic)
    if (!date) return { previous: null, history: [] }
    const [previous, history] = await Promise.all([
      loadPreviousSnapshot(params.epic, date),
      loadHistory(params.epic),
    ])
    return { previous, history }
  },
  component: TodayRoute,
})

function TodayRoute() {
  const { previous, history } = Route.useLoaderData()
  return <TodayPage previous={previous} history={history} />
}
