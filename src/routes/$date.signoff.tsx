import { createFileRoute } from '@tanstack/react-router'
import { SignOffPage } from '@/components/dashboard/pages/SignOffPage'

export const Route = createFileRoute('/$date/signoff')({
  component: SignOffPage,
})
