import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '@/components/dashboard/pages/PeoplePage'

export const Route = createFileRoute('/$epic/$date/people')({
  component: PeoplePage,
})
