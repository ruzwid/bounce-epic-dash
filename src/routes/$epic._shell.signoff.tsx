import { createFileRoute } from '@tanstack/react-router'
import { epicTitle } from '@/lib/dashboard/appConfig'
import { SignOffPage } from '@/components/dashboard/pages/SignOffPage'

export const Route = createFileRoute('/$epic/_shell/signoff')({
  head: ({ params }) => ({ meta: [{ title: `Sign-off — ${epicTitle(params.epic)}` }] }),
  component: SignOffPage,
})
