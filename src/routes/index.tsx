import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  // Placeholder — replaced by the real dashboard composition in Task 11.
  return (
    <main className="page-wrap py-10">
      <p className="text-muted-foreground">Dashboard under construction.</p>
    </main>
  )
}
