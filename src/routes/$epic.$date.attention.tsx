import { createFileRoute } from '@tanstack/react-router'
import { AttentionPage } from '@/components/dashboard/pages/AttentionPage'

export const Route = createFileRoute('/$epic/$date/attention')({
  component: AttentionPage,
})
