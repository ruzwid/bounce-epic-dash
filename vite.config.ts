import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { parse } from 'yaml'
import { config as loadDotenv } from 'dotenv'
import { EPICS_REGISTRY_PATH, epicConfigPath, loadEpicRegistry } from './src/lib/epics'
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

// Config files run in Node at build time — this is not a runtime fetch,
// it's how the prerenderer learns which /$epic and /$epic/$date pages
// exist. Dynamic routes need an explicit `pages` entry or `crawlLinks`;
// there's no same-page-only link between snapshot dates for crawlLinks to
// follow, so list them explicitly for deterministic, complete coverage.
//
// One entry per epic (its "latest" page) plus one per snapshot it has. An
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
    return [`/${slug}`, ...dates.map((date) => `/${slug}/${date}`)]
  })
}

// Every epic's config.yaml, resolved to plain JS at build time, keyed by
// slug.
//
// The browser needs three things from each: the people map (to turn a
// display name back into a GitHub login for avatars), the full structure
// (for the Config page), and the Jira host (to link tickets from
// titles/cards). Parsing YAML at *runtime* to get any of this would put
// the `yaml` package in the bundle of every page that shows an avatar —
// about 100KB to look up a username. Parsing here instead means the client
// ships data, not a parser.
//
// The epic registry rides along in the same module, because the switcher
// in the sidebar needs to know which epics exist and which is the default,
// and epics.yaml is read with `fs` (Node-only) exactly like the configs.
function appConfigPlugin(): Plugin {
  const virtualId = 'virtual:app-config'
  const resolvedId = `\0${virtualId}`
  // Absolute: a virtual module has no directory of its own, so a relative
  // path here gets resolved against the virtual id and fails.
  const abs = (path: string) => fileURLToPath(new URL(`./${path}`, import.meta.url))

  return {
    name: 'app-config-yaml',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null

      const registryPath = abs(EPICS_REGISTRY_PATH)
      const registry = loadEpicRegistry()
      // Watched so editing a config (or the registry) hot-reloads in dev
      // rather than silently serving a stale copy until the next restart.
      this.addWatchFile(registryPath)

      const configs: Record<string, unknown> = {}
      const sources: Record<string, string> = {}
      for (const slug of registry.epics) {
        const path = abs(epicConfigPath(slug))
        this.addWatchFile(path)
        const source = readFileSync(path, 'utf8')
        configs[slug] = parse(source)
        sources[slug] = source
      }

      // JIRA_BASE_URL is a host, not a secret (no token/email baked in) —
      // safe to ship to the client. Null when unset, so a checkout without
      // .env.local just renders tickets unlinked instead of failing the
      // build. Shared across epics: they're all the same JIRA site.
      const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '') ?? null
      return [
        `export const epicRegistry = ${JSON.stringify(registry)};`,
        `export const appConfigs = ${JSON.stringify(configs)};`,
        `export const appConfigSources = ${JSON.stringify(sources)};`,
        `export const jiraBaseUrl = ${JSON.stringify(jiraBaseUrl)};`,
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
