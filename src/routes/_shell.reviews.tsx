import { createFileRoute } from '@tanstack/react-router'
import { ReviewsPage } from '@/components/dashboard/pages/ReviewsPage'

export const Route = createFileRoute('/_shell/reviews')({
  head: () => ({ meta: [{ title: 'Reviews — WPP at Scale' }] }),
  component: ReviewsPage,
})
