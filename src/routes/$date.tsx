import { useState } from 'react'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { loadHistory, loadPreviousSnapshot, loadSnapshot } from '@/lib/dashboard/snapshots'
import { dashboardSearchSchema } from '@/lib/dashboard/search'
import { DashboardPage } from '@/components/dashboard/DashboardPage'

export const Route = createFileRoute('/$date')({
  validateSearch: dashboardSearchSchema,
  loader: async ({ params }) => {
    const snapshot = await loadSnapshot(params.date)
    if (!snapshot) throw notFound()
    const [previous, history] = await Promise.all([
      loadPreviousSnapshot(snapshot.date),
      loadHistory(),
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
  component: DateRoute,
})

function NotFoundSnapshot() {
  const { date } = Route.useParams()
  return (
    <main className="page-wrap flex flex-col gap-3 py-10">
      <p className="m-0 text-lg">
        No snapshot for <span className="font-mono-data">{date}</span>.
      </p>
      <Link to="/" className="underline">
        Back to the latest snapshot
      </Link>
    </main>
  )
}

function DateRoute() {
  const { snapshot, previous, history } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [now] = useState(() => new Date())

  return (
    <DashboardPage
      snapshot={snapshot}
      previous={previous}
      history={history}
      search={search}
      onSearchChange={(updates) => navigate({ search: (prev) => ({ ...prev, ...updates }) })}
      now={now}
    />
  )
}
