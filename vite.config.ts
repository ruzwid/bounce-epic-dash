import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import { config as loadDotenv } from 'dotenv'
import { appConfigPlugin } from './build/app-config-plugin'
import { loadEpicRegistry } from './src/lib/epics'
import { nitro } from 'nitro/vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Same convention as scripts/collect.ts and scripts/merge.ts: .env.local is
// not auto-loaded by Vite, so this is the only way appConfigPlugin below
// can see JIRA_BASE_URL. Silently no-ops if the file is absent (CI/prod
// set real env vars instead) — never throws on a missing .env.local.
loadDotenv({ path: '.env.local' })

// How many of an epic's most recent snapshot dates get prerendered.
//
// Every date that isn't in this window still works — it falls through to
// the Nitro server function, which renders it on demand (see the note on
// the nitro() plugin below). The window decides what is *fast*, not what
// exists, and the cost of widening it is not linear in days: one snapshot
// date is one dated page per feature, per milestone, plus the eight fixed
// pages — around 35 pages and 11MB of build output at this epic's current
// size, for every single day of collection, forever. Prerendering the lot
// meant the build got permanently slower and the deploy permanently bigger
// every time the pipeline ran.
//
// Two weeks covers "what changed while I was away" for anyone coming back
// from a holiday, which is the only time anyone opens a dated URL in
// anger. Older dates are cold links — an occasional cold render is the
// right trade for a build that doesn't grow without bound.
const PRERENDERED_DATES = 14

// Config files run in Node at build time — this is not a runtime fetch,
// it's how the prerenderer learns which /$epic and /$epic/$date pages
// exist. Dynamic routes need an explicit `pages` entry or `crawlLinks`;
// nothing in the UI links from one snapshot date to another, so there is
// nothing for crawlLinks to follow and this list is the whole of what gets
// prerendered under a date.
//
// One entry per epic (its "latest" page) plus its most recent dates. An
// epic configured but not yet collected contributes only its latest page,
// which renders the "no snapshots yet" state rather than 404ing.
function epicPages(): string[] {
  const registry = loadEpicRegistry()
  return registry.epics.flatMap((slug) => {
    let dates: string[] = []
    try {
      dates = readdirSync(`data/snapshots/${slug}`)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()
    } catch {
      dates = []
    }
    return [`/${slug}`, ...dates.slice(-PRERENDERED_DATES).map((date) => `/${slug}/${date}`)]
  })
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
      pages: [{ path: '/' }, ...epicPages().map((path) => ({ path }))],
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
