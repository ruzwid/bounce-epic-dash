import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import type { ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import TanstackQueryProvider, {
  getContext,
} from './integrations/tanstack-query/root-provider'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Loader results never go stale within a build. Every one of them reads
    // a committed JSON snapshot through import.meta.glob — there is no
    // server to ask and nothing that can change until the next deploy, at
    // which point the whole client bundle is new anyway. At 0 the default
    // behaviour was to re-run a route's loader on every hover, which for
    // the dated routes meant re-deriving a snapshot's worth of summaries
    // each time a pointer crossed a link.
    defaultPreloadStaleTime: Infinity,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
