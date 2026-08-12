import { createFileRoute } from '@tanstack/react-router'
import { FeatureBySlug } from '@/components/dashboard/pages/FeatureBySlug'

export const Route = createFileRoute('/_shell/f/$code')({
  component: FeatureRoute,
})

function FeatureRoute() {
  const { code } = Route.useParams()
  return <FeatureBySlug code={code} />
}
