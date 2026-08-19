import { createFileRoute } from '@tanstack/react-router'
import { loadScopeHistory } from '@/lib/dashboard/snapshots'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { ScopePage } from '@/components/dashboard/pages/ScopePage'

// Scope changes are a diff of feature and story *sets*, so this needs
// history the KPI counts can't express — trimmed to the fields the diff
// reads, and loaded on this route alone. See loadScopeHistory.
export const Route = createFileRoute('/$epic/{-$date}/scope')({
  // `upTo` is the date in the URL, or undefined (i.e. everything) on the
  // latest page: a historical page must not show scope changes that
  // hadn't happened yet as of the snapshot being read.
  loader: async ({ params }) => ({ snapshots: await loadScopeHistory(params.epic, params.date) }),
  head: ({ params }) => ({ meta: [{ title: pageTitle('Scope', params.epic, params.date) }] }),
  component: ScopeRoute,
})

function ScopeRoute() {
  const { snapshots } = Route.useLoaderData()
  return <ScopePage snapshots={snapshots} />
}
