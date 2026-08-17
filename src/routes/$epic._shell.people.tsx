import { createFileRoute } from '@tanstack/react-router'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { PeoplePage } from '@/components/dashboard/pages/PeoplePage'

export const Route = createFileRoute('/$epic/_shell/people')({
  head: ({ params }) => ({ meta: [{ title: `People — ${epicTitle(params.epic)}` }] }),
  component: PeoplePage,
})
