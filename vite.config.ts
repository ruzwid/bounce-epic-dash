import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { parse } from 'yaml'
import { nitro } from 'nitro/vite'
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

// config.yaml, resolved to plain JS at build time.
//
// The browser needs two things from it: the people map (to turn a display
// name back into a GitHub login for avatars) and the full structure (for
// the Config page). Parsing YAML at *runtime* to get either would put the
// `yaml` package in the bundle of every page that shows an avatar — about
// 100KB to look up a username. Parsing here instead means the client ships
// data, not a parser.
function appConfigPlugin(): Plugin {
  const virtualId = 'virtual:app-config'
  const resolvedId = `\0${virtualId}`
  // Absolute: a virtual module has no directory of its own, so a relative
  // path here gets resolved against the virtual id and fails.
  const configPath = fileURLToPath(new URL('./config.yaml', import.meta.url))

  return {
    name: 'app-config-yaml',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      const source = readFileSync(configPath, 'utf8')
      // Watched so editing config.yaml hot-reloads in dev rather than
      // silently serving a stale copy until the next restart.
      this.addWatchFile(configPath)
      return [
        `export const appConfig = ${JSON.stringify(parse(source))};`,
        `export const appConfigSource = ${JSON.stringify(source)};`,
      ].join('\n')
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    appConfigPlugin(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
      pages: [{ path: '/' }, ...snapshotDatePages().map((path) => ({ path }))],
    }),
    // Nitro turns the Start build into a deployable server. No preset is
    // set here on purpose: Nitro detects its target from the environment,
    // so `pnpm build` locally produces a plain Node server in .output/ and
    // the same command on Vercel produces Build Output API v3 in
    // .vercel/output/. Hardcoding `preset: 'vercel'` would break the
    // local build for no gain.
    //
    // Note that every real page is still prerendered to static HTML above
    // and served straight from the CDN — the server function only handles
    // URLs that were never prerendered (an unknown snapshot date, a
    // renamed feature slug), so those get the app's own not-found page
    // instead of a bare platform 404.
    nitro(),
    viteReact(),
  ],
})

export default config
