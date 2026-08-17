import { createFileRoute } from '@tanstack/react-router'
import { loadScopeHistory } from '@/lib/dashboard/snapshots'
import { ScopePage } from '@/components/dashboard/pages/ScopePage'

export const Route = createFileRoute('/$epic/$date/scope')({
  // Everything up to and including the date being viewed — a historical
  // page must not show scope changes that hadn't happened yet.
  loader: async ({ params }) => ({ snapshots: await loadScopeHistory(params.epic, params.date) }),
  component: ScopeRoute,
})

function ScopeRoute() {
  const { snapshots } = Route.useLoaderData()
  return <ScopePage snapshots={snapshots} />
}
