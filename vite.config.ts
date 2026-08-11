import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Config files run in Node at build time — this is not a runtime fetch,
// it's how the prerenderer learns which /$date pages exist. Dynamic
// routes need an explicit `pages` entry or `crawlLinks`; there's no
// same-page-only link between snapshot dates for crawlLinks to follow,
// so list them explicitly for deterministic, complete coverage.
function snapshotDatePages(): string[] {
  try {
    return readdirSync('data/snapshots')
      .filter((f) => f.endsWith('.json'))
      .map((f) => `/${f.replace(/\.json$/, '')}`)
  } catch {
    return []
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
      pages: [{ path: '/' }, ...snapshotDatePages().map((path) => ({ path }))],
    }),
    viteReact(),
  ],
})

export default config
