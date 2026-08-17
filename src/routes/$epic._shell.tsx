import { useState } from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  stripSearchParams,
  useNavigate,
  type SearchMiddleware,
} from '@tanstack/react-router'
import { loadHistory, loadLatestSnapshot, loadPreviousSnapshot } from '@/lib/dashboard/snapshots'
import { DEFAULT_EPIC, EPICS, epicTitle, isKnownEpic } from '@/lib/dashboard/appConfig'
import { DASHBOARD_SEARCH_DEFAULTS, dashboardSearchSchema, type DashboardSearch } from '@/lib/dashboard/search'
import { AppShell } from '@/components/dashboard/shell/AppShell'
import { EmptyState } from '@/components/dashboard/EmptyState'

// Wrapped in a function rather than passed as
// stripSearchParams(DASHBOARD_SEARCH_DEFAULTS) directly: the SSR bundle
// splits this route's config into a chunk that circularly imports the
// chunk defining DASHBOARD_SEARCH_DEFAULTS, so a module-eval-time read
// races the cycle and sees it as undefined. A deferred read (first real
// navigation, after the whole module graph has finished loading) sees it
// defined either way.
const stripDashboardDefaults: SearchMiddleware<DashboardSearch> = (ctx) =>
  stripSearchParams<DashboardSearch>(DASHBOARD_SEARCH_DEFAULTS)(ctx)

/** A path segment that is really a snapshot date, not an epic slug. */
const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/

// Pathless layout for the "latest snapshot" half of one epic: it owns the
// sidebar, the epic header, and the loaded snapshot, so every page under
// it is just content. Its mirror image is /$epic/$date, which loads one
// specific historical snapshot into the identical shell.
export const Route = createFileRoute('/$epic/_shell')({
  validateSearch: dashboardSearchSchema,
  // Keeps default filter values out of the URL — without it every page
  // load rewrites "/wpp-at-scale" to
  // "/wpp-at-scale?milestone=all&engineer=null&…", which makes shared
  // links noisy and costs a redirect before the prerendered HTML.
  // See the note on stripDashboardDefaults above for why it's wrapped.
  search: { middlewares: [stripDashboardDefaults] },
  beforeLoad: ({ params }) => {
    if (isKnownEpic(params.epic)) return
    // Links from before the dashboard tracked more than one epic point at
    // "/2026-08-17" and "/2026-08-17/attention" — a date where an epic
    // slug now goes. Send those to the default epic rather than 404ing on
    // a URL that was correct when it was shared.
    if (DATE_SEGMENT.test(params.epic)) {
      throw redirect({
        to: '/$epic/$date',
        params: { epic: DEFAULT_EPIC, date: params.epic },
        replace: true,
      })
    }
    throw notFound()
  },
  loader: async ({ params }) => {
    const snapshot = await loadLatestSnapshot(params.epic)
    // Null is a real state, not an error: an epic added to epics.yaml
    // whose first collection run hasn't happened yet has no snapshots.
    if (!snapshot) return { snapshot: null, previous: null, history: [] }
    const [previous, history] = await Promise.all([
      loadPreviousSnapshot(params.epic, snapshot.date),
      loadHistory(params.epic),
    ])
    return { snapshot, previous, history }
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.snapshot
      ? [
          { title: `${loaderData.snapshot.epic.title} — Status` },
          { name: 'description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:title', content: loaderData.snapshot.epic.title },
          { property: 'og:description', content: loaderData.snapshot.headline.sentence },
          { property: 'og:type', content: 'website' },
        ]
      : [],
  }),
  notFoundComponent: UnknownEpic,
  component: ShellRoute,
})

function UnknownEpic() {
  const { epic } = Route.useParams()
  return (
    <main className="page-wrap flex flex-col gap-3 py-10">
      <h1 className="font-display m-0 text-2xl">
        No epic called <span className="font-mono-data">{epic}</span>
      </h1>
      <p className="m-0 text-sm text-muted-foreground">
        This dashboard tracks {EPICS.length === 1 ? 'one epic' : `${EPICS.length} epics`}. Add another by creating
        <span className="font-mono-data"> epics/&lt;slug&gt;/config.yaml</span> and listing the slug in
        <span className="font-mono-data"> epics.yaml</span>.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {EPICS.map((slug) => (
          <li key={slug}>
            <Link to="/$epic" params={{ epic: slug }}>
              {epicTitle(slug)}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

function ShellRoute() {
  const { snapshot, previous, history } = Route.useLoaderData()
  const { epic } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  // Computed once per mount (not on every render) — keeps SSR and the
  // client's initial hydration close enough that isStale/needsAttention
  // never disagree in practice, without freezing "now" forever.
  const [now] = useState(() => new Date())

  if (!snapshot) return <NoSnapshotsYet epic={epic} />

  return (
    <AppShell
      value={{
        epic,
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

/** A configured epic with no collection run yet. Rendered outside AppShell
 *  on purpose — the shell is built entirely from a snapshot, and there
 *  isn't one. */
function NoSnapshotsYet({ epic }: { epic: string }) {
  return (
    <main className="page-wrap flex flex-col gap-3 py-10">
      <h1 className="font-display m-0 text-2xl">{epicTitle(epic)}</h1>
      <EmptyState
        message={`No snapshots yet. Run "pnpm collect --epic ${epic}", then the judge skill, then "pnpm merge --epic ${epic}" — the first full run writes this epic's first page.`}
      />
      <Link to="/$epic" params={{ epic: DEFAULT_EPIC }} className="text-sm">
        Back to {epicTitle(DEFAULT_EPIC)}
      </Link>
    </main>
  )
}
