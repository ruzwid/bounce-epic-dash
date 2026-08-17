import { createFileRoute } from '@tanstack/react-router'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { AttentionPage } from '@/components/dashboard/pages/AttentionPage'

export const Route = createFileRoute('/$epic/_shell/attention')({
  head: ({ params }) => ({ meta: [{ title: `Needs attention — ${epicTitle(params.epic)}` }] }),
  component: AttentionPage,
})
