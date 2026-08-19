import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { PeoplePage } from '@/components/dashboard/pages/PeoplePage'

export const Route = createFileRoute('/$epic/{-$date}/people')({
  head: ({ params }) => ({ meta: [{ title: pageTitle('People', params.epic, params.date) }] }),
  component: PeoplePage,
})
