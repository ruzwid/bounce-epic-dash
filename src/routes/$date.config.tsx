import { createFileRoute } from '@tanstack/react-router'
import { ConfigPage } from '@/components/dashboard/pages/ConfigPage'

export const Route = createFileRoute('/$date/config')({
  component: ConfigPage,
})
