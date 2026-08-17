import { createFileRoute } from '@tanstack/react-router'
import { loadScopeHistory } from '@/lib/dashboard/snapshots'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { ScopePage } from '@/components/dashboard/pages/ScopePage'

// Scope changes are a diff of feature and story *sets*, so this needs
// history the KPI counts can't express — trimmed to the fields the diff
// reads, and loaded on this route alone. See loadScopeHistory.
export const Route = createFileRoute('/$epic/_shell/scope')({
  loader: async ({ params }) => ({ snapshots: await loadScopeHistory(params.epic) }),
  head: ({ params }) => ({ meta: [{ title: `Scope — ${epicTitle(params.epic)}` }] }),
  component: ScopeRoute,
})

function ScopeRoute() {
  const { snapshots } = Route.useLoaderData()
  return <ScopePage snapshots={snapshots} />
}
