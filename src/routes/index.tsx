import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_EPIC } from '@/lib/dashboard/appConfig'

// "/" is not a page of its own — every real page belongs to one epic, so
// the root sends the reader to the default epic's latest snapshot
// (epics.yaml's `default`). Prerendered, so this costs a static redirect
// from the CDN rather than a server round trip.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/$epic/{-$date}', params: { epic: DEFAULT_EPIC }, replace: true })
  },
})
