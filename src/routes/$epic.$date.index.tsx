import { createFileRoute } from '@tanstack/react-router'
import { TodayPage } from '@/components/dashboard/pages/TodayPage'

export const Route = createFileRoute('/$epic/$date/')({
  component: TodayPage,
})
