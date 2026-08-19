import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { AttentionPage } from '@/components/dashboard/pages/AttentionPage'

export const Route = createFileRoute('/$epic/{-$date}/attention')({
  head: ({ params }) => ({ meta: [{ title: pageTitle('Needs attention', params.epic, params.date) }] }),
  component: AttentionPage,
})
