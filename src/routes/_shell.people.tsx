import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '@/components/dashboard/pages/PeoplePage'

export const Route = createFileRoute('/_shell/people')({
  head: () => ({ meta: [{ title: 'People — WPP at Scale' }] }),
  component: PeoplePage,
})
