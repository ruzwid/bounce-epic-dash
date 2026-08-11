import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  // Placeholder — replaced by the real dashboard composition once the
  // component library (src/components/dashboard/) is built out.
  return (
    <main className="page-wrap py-10">
      <p className="text-muted-foreground">Dashboard under construction.</p>
    </main>
  )
}
