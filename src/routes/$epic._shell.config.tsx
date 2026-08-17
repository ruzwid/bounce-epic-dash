import { createFileRoute } from '@tanstack/react-router'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { ConfigPage } from '@/components/dashboard/pages/ConfigPage'

export const Route = createFileRoute('/$epic/_shell/config')({
  head: ({ params }) => ({ meta: [{ title: `Config — ${epicTitle(params.epic)}` }] }),
  component: ConfigPage,
})
