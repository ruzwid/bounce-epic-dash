import { useCallback, useMemo, useState } from 'react'
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
import { loadLatestSnapshot, loadPreviousSummary, loadSnapshot } from '@/lib/dashboard/snapshots'
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

// The shell every page in the dashboard renders inside: the sidebar, the
// epic header, and one loaded snapshot.
//
// `{-$date}` is an optional path segment, so this one route serves both
// halves of the site — "/wpp-at-scale/reviews" reads the latest snapshot
// and "/wpp-at-scale/2026-08-17/reviews" reads that specific one. It used
// to be two mirrored route trees (`/$epic/_shell/*` and `/$epic/$date/*`),
// which meant every page existed as two near-identical files that had to
// be kept in step by hand, and every link in the shell was written twice.
// The only real difference between them was which snapshot the loader
// picked, which is the single branch below.
export const Route = createFileRoute('/$epic/{-$date}')({
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
        to: '/$epic/{-$date}',
        params: { epic: DEFAULT_EPIC, date: params.epic },
        replace: true,
      })
    }
    throw notFound()
  },
  // What this returns is serialised into every prerendered page under the
  // shell, so it carries the current snapshot and *summaries* of anything
  // else — never a second snapshot. The Today route, which is the one page
  // that diffs the previous snapshot story by story, loads that itself.
  loader: async ({ params }) => {
    const snapshot = params.date
      ? await loadSnapshot(params.epic, params.date)
      : await loadLatestSnapshot(params.epic)

    if (!snapshot) {
      // A date in the URL that has no snapshot is a genuinely wrong URL.
      if (params.date) throw notFound()
      // No date and nothing to show is a real state, not an error: an epic
      // added to epics.yaml whose first collection run hasn't happened yet.
      return { snapshot: null, previousSummary: null }
    }

    return { snapshot, previousSummary: await loadPreviousSummary(params.epic, snapshot.date) }
  },
  head: ({ params, loaderData }) => {
    const snapshot = loaderData?.snapshot
    if (!snapshot) return { meta: [] }
    return {
      meta: [
        // A dated URL is a permanent record of one day; the undated one is
        // "wherever this epic stands now". The titles say which you're on.
        { title: params.date ? `${snapshot.epic.title} — ${snapshot.date}` : `${snapshot.epic.title} — Status` },
        { name: 'description', content: snapshot.headline.sentence },
        { property: 'og:title', content: snapshot.epic.title },
        { property: 'og:description', content: snapshot.headline.sentence },
        { property: 'og:type', content: 'website' },
      ],
    }
  },
  notFoundComponent: ShellNotFound,
  component: ShellRoute,
})

/** Both of the shell's not-found cases: an epic slug that isn't in
 *  epics.yaml (thrown in beforeLoad) and a date with no snapshot on record
 *  (thrown in the loader). One component because one route now throws
 *  both, and which of the two it is, is exactly whether `date` is set. */
function ShellNotFound() {
  const { epic, date } = Route.useParams()

  if (date) {
    return (
      <main className="page-wrap flex flex-col gap-3 py-10">
        <h1 className="font-display m-0 text-2xl">
          No snapshot for <span className="font-mono-data">{date}</span>
        </h1>
        <p className="m-0 text-sm text-muted-foreground">
          Snapshots are written one per collection run, per epic — this date has none on record for{' '}
          <span className="font-mono-data">{epic}</span>.
        </p>
        <Link to="/$epic/{-$date}" params={{ epic }} className="text-sm">
          Back to the latest snapshot
        </Link>
      </main>
    )
  }

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
            <Link to="/$epic/{-$date}" params={{ epic: slug }}>
              {epicTitle(slug)}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

function ShellRoute() {
  const { snapshot, previousSummary } = Route.useLoaderData()
  const { epic, date } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  // Computed once per mount (not on every render) — keeps SSR and the
  // client's initial hydration close enough that isStale/needsAttention
  // never disagree in practice, without freezing "now" forever.
  const [now] = useState(() => new Date())
  // Stable across renders. Changing a filter re-renders this route, and a
  // fresh Date here would be a changed prop for everything downstream that
  // ages data against the snapshot's instant — including the memoised
  // blocks that exist to keep the charts still.
  const asOf = useMemo(() => new Date(snapshot?.generatedAt ?? 0), [snapshot?.generatedAt])
  // `to: '.'` keeps the reader on whichever child page they're on; filters
  // are URL state and must survive navigation between pages.
  const onSearchChange = useCallback(
    (updates: Partial<DashboardSearch>) => navigate({ to: '.', search: (prev) => ({ ...prev, ...updates }) }),
    [navigate],
  )

  if (!snapshot) return <NoSnapshotsYet epic={epic} />

  return (
    <AppShell
      value={{
        epic,
        snapshot,
        previousSummary,
        date: date ?? null,
        now,
        asOf,
        search,
        onSearchChange,
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
      <Link to="/$epic/{-$date}" params={{ epic: DEFAULT_EPIC }} className="text-sm">
        Back to {epicTitle(DEFAULT_EPIC)}
      </Link>
    </main>
  )
}
