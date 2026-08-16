import { useState } from 'react'
import { Outlet, createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { loadHistory, loadLatestSnapshot, loadPreviousSnapshot } from '@/lib/dashboard/snapshots'
import { DASHBOARD_SEARCH_DEFAULTS, dashboardSearchSchema } from '@/lib/dashboard/search'
import { AppShell } from '@/components/dashboard/shell/AppShell'

// Pathless layout for the "latest snapshot" half of the app: it owns the
// sidebar, the epic header, and the loaded snapshot, so every page under
// it is just content. Its mirror image is /$date, which loads one specific
// historical snapshot into the identical shell.
export const Route = createFileRoute('/_shell')({
  validateSearch: dashboardSearchSchema,
  // Keeps default filter values out of the URL — without it every page
  // load rewrites "/" to "/?milestone=all&engineer=null&…", which makes
  // shared links noisy and costs a redirect before the prerendered HTML.
  search: { middlewares: [stripSearchParams(DASHBOARD_SEARCH_DEFAULTS)] },
  loader: async () => {
    const snapshot = await loadLatestSnapshot()
    const [previous, history] = await Promise.all([
      loadPreviousSnapshot(snapshot.date),
      loadHistory(),
    ])
    return { snapshot, previous, history }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.snapshot.epic.title} — Status` },
          { name: 'description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:title', content: loaderData.snapshot.epic.title },
          { property: 'og:description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:type', content: 'website' },
        ]
      : [],
  }),
  component: ShellRoute,
})

function ShellRoute() {
  const { snapshot, previous, history } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  // Computed once per mount (not on every render) — keeps SSR and the
  // client's initial hydration close enough that isStale/needsAttention
  // never disagree in practice, without freezing "now" forever.
  const [now] = useState(() => new Date())

  return (
    <AppShell
      value={{
        snapshot,
        previous,
        history,
        date: null,
        now,
        asOf: new Date(snapshot.generatedAt),
        search,
        // `to: '.'` keeps the reader on whichever child page they're on;
        // filters are URL state and must survive navigation between pages.
        onSearchChange: (updates) => navigate({ to: '.', search: (prev) => ({ ...prev, ...updates }) }),
      }}
    >
      <Outlet />
    </AppShell>
  )
}
