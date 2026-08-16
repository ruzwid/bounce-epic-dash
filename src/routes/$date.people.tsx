import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '@/components/dashboard/pages/PeoplePage'

export const Route = createFileRoute('/$date/people')({
  component: PeoplePage,
})
