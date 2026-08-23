import { Link, type ErrorComponentProps } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

/**
 * The last line of defence for a render or loader error, wired in as the
 * router's `defaultErrorComponent` (see src/router.tsx).
 *
 * There is one realistic way to get here. Every page is built from a
 * committed JSON snapshot parsed through zod on read (see the note in
 * src/lib/dashboard/snapshots.ts), and only the most recent snapshot dates
 * are prerendered — vite.config.ts's PRERENDERED_DATES. A dated URL older
 * than that window is rendered on demand, so a snapshot the current schema
 * can no longer parse throws in front of the reader rather than in front of
 * the build. Without this, that surfaced as the router's stock error box:
 * a raw message, no styling, and no way back to a page that works.
 *
 * `reset` re-renders the boundary, which is the right first move for a
 * transient failure (a chunk that failed to fetch) and harmless for a
 * permanent one — the message just comes back.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error)

  return (
    <main className="page-wrap flex flex-col items-start gap-3 py-10">
      <h1 className="font-display m-0 text-2xl">This page didn't render</h1>
      <p className="m-0 max-w-[70ch] text-sm text-muted-foreground">
        Something went wrong building this view. If you got here from an old dated link, that snapshot may predate the
        current schema — the latest one will read fine.
      </p>
      <pre className="font-mono-data m-0 max-w-full overflow-x-auto rounded-4xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {message}
      </pre>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
        <Link to="/" className="text-sm">
          Back to the latest snapshot
        </Link>
      </div>
    </main>
  )
}
