import { createFileRoute } from '@tanstack/react-router'
import { AttentionPage } from '@/components/dashboard/pages/AttentionPage'

export const Route = createFileRoute('/_shell/attention')({
  head: () => ({ meta: [{ title: 'Needs attention — WPP at Scale' }] }),
  component: AttentionPage,
})
