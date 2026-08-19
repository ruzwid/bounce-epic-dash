import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { ConfigPage } from '@/components/dashboard/pages/ConfigPage'

export const Route = createFileRoute('/$epic/{-$date}/config')({
  head: ({ params }) => ({ meta: [{ title: pageTitle('Config', params.epic, params.date) }] }),
  component: ConfigPage,
})
