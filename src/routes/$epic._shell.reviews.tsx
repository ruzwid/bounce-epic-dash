import { createFileRoute } from '@tanstack/react-router'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { ReviewsPage } from '@/components/dashboard/pages/ReviewsPage'

export const Route = createFileRoute('/$epic/_shell/reviews')({
  head: ({ params }) => ({ meta: [{ title: `Reviews — ${epicTitle(params.epic)}` }] }),
  component: ReviewsPage,
})
