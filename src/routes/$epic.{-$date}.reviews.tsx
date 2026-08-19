import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { ReviewsPage } from '@/components/dashboard/pages/ReviewsPage'

export const Route = createFileRoute('/$epic/{-$date}/reviews')({
  head: ({ params }) => ({ meta: [{ title: pageTitle('Reviews', params.epic, params.date) }] }),
  component: ReviewsPage,
})
