import { createFileRoute } from '@tanstack/react-router'
import { ConfigPage } from '@/components/dashboard/pages/ConfigPage'

export const Route = createFileRoute('/_shell/config')({
  head: () => ({ meta: [{ title: 'Config — WPP at Scale' }] }),
  component: ConfigPage,
})
