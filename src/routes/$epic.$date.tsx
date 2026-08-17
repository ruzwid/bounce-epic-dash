import { useState } from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  stripSearchParams,
  useNavigate,
  type SearchMiddleware,
} from '@tanstack/react-router'
import { loadHistory, loadPreviousSnapshot, loadSnapshot } from '@/lib/dashboard/snapshots'
import { isKnownEpic } from '@/lib/dashboard/appConfig'
import { DASHBOARD_SEARCH_DEFAULTS, dashboardSearchSchema, type DashboardSearch } from '@/lib/dashboard/search'
import { AppShell } from '@/components/dashboard/shell/AppShell'

// Wrapped in a function rather than passed as
// stripSearchParams(DASHBOARD_SEARCH_DEFAULTS) directly: the SSR bundle
// splits this route's config into a chunk that circularly imports the
// chunk defining DASHBOARD_SEARCH_DEFAULTS, so a module-eval-time read
// races the cycle and sees it as undefined. A deferred read (first real
// navigation, after the whole module graph has finished loading) sees it
// defined either way.
const stripDashboardDefaults: SearchMiddleware<DashboardSearch> = (ctx) =>
  stripSearchParams<DashboardSearch>(DASHBOARD_SEARCH_DEFAULTS)(ctx)

// The historical mirror of /$epic/_shell: same shell, same pages, one
// specific snapshot of one specific epic. Every link the shell renders
// carries both the epic and the date forward, so browsing an old snapshot
// never silently drops you back onto today's — or onto another epic's.
export const Route = createFileRoute('/$epic/$date')({
  validateSearch: dashboardSearchSchema,
  // See the note on stripDashboardDefaults above, and the same option in
  // $epic._shell.tsx.
  search: { middlewares: [stripDashboardDefaults] },
  loader: async ({ params }) => {
    // An unknown epic can't have a snapshot; checking it here keeps the
    // "no such page" answer the same for both halves of the URL.
    if (!isKnownEpic(params.epic)) throw notFound()
    const snapshot = await loadSnapshot(params.epic, params.date)
    if (!snapshot) throw notFound()
    const [previous, history] = await Promise.all([
      loadPreviousSnapshot(params.epic, snapshot.date),
      loadHistory(params.epic),
    ])
    return { snapshot, previous, history }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.snapshot.epic.title} — ${loaderData.snapshot.date}` },
          { name: 'description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:title', content: loaderData.snapshot.epic.title },
          { property: 'og:description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:type', content: 'website' },
        ]
      : [],
  }),
  notFoundComponent: NotFoundSnapshot,
  component: DateShellRoute,
})

function NotFoundSnapshot() {
  const { epic, date } = Route.useParams()
  return (
    <main className="page-wrap flex flex-col gap-3 py-10">
      <h1 className="font-display m-0 text-2xl">
        No snapshot for <span className="font-mono-data">{date}</span>
      </h1>
      <p className="m-0 text-sm text-muted-foreground">
        Snapshots are written one per collection run, per epic — this date has none on record for{' '}
        <span className="font-mono-data">{epic}</span>.
      </p>
      <Link to="/$epic" params={{ epic }} className="text-sm">
        Back to the latest snapshot
      </Link>
    </main>
  )
}

function DateShellRoute() {
  const { snapshot, previous, history } = Route.useLoaderData()
  const { epic, date } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [now] = useState(() => new Date())

  return (
    <AppShell
      value={{
        epic,
        snapshot,
        previous,
        history,
        date,
        now,
        asOf: new Date(snapshot.generatedAt),
        search,
        onSearchChange: (updates) => navigate({ to: '.', search: (prev) => ({ ...prev, ...updates }) }),
      }}
    >
      <Outlet />
    </AppShell>
  )
}
