import { createFileRoute } from '@tanstack/react-router'
import { ReviewsPage } from '@/components/dashboard/pages/ReviewsPage'

export const Route = createFileRoute('/$epic/$date/reviews')({
  component: ReviewsPage,
})
