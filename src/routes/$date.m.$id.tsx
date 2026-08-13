import { createFileRoute } from '@tanstack/react-router'
import { MilestoneBySlug } from '@/components/dashboard/pages/MilestoneBySlug'

export const Route = createFileRoute('/$date/m/$id')({
  component: MilestoneRoute,
})

function MilestoneRoute() {
  const { id } = Route.useParams()
  return <MilestoneBySlug id={id} />
}
