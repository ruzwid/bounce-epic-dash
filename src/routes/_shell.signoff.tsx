import { createFileRoute } from '@tanstack/react-router'
import { SignOffPage } from '@/components/dashboard/pages/SignOffPage'

export const Route = createFileRoute('/_shell/signoff')({
  head: () => ({ meta: [{ title: 'Sign-off — WPP at Scale' }] }),
  component: SignOffPage,
})
