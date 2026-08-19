import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/dashboard/pageTitle'
import { SignOffPage } from '@/components/dashboard/pages/SignOffPage'

export const Route = createFileRoute('/$epic/{-$date}/signoff')({
  head: ({ params }) => ({ meta: [{ title: pageTitle('Sign-off', params.epic, params.date) }] }),
  component: SignOffPage,
})
