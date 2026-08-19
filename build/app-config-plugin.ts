// build/app-config-plugin.ts
// The `virtual:app-config` modules, shared by vite.config.ts and
// vitest.config.ts.
//
// This lived twice — once in each config — with a comment explaining that
// the duplicate was deliberate, because importing it from vite.config.ts
// would drag the whole TanStack Start / Nitro plugin chain into a node test
// run. That reasoning was right about the problem and wrong about the fix:
// the two copies drifted the first time one of them changed, and the tests
// went on passing against a virtual module the app no longer had. A
// separate file both can import needs nothing but node, yaml and zod, and
// there is only one of it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { parse } from "yaml";
import { Config } from "../src/lib/config-schema";
import { EPICS_REGISTRY_PATH, epicConfigPath, loadEpicRegistry } from "../src/lib/epics";

const VIRTUAL_ID = "virtual:app-config";
const SOURCES_ID = "virtual:app-config/sources";

/**
 * Every epic's config.yaml, resolved to plain JS at build time, keyed by
 * slug.
 *
 * The browser needs three things from each: the people map (to turn a
 * display name back into a GitHub login for avatars), the full structure
 * (for the Config page), and the Jira host (to link tickets from
 * titles/cards). Parsing YAML at *runtime* to get any of this would put
 * the `yaml` package in the bundle of every page that shows an avatar —
 * about 100KB to look up a username. Parsing here instead means the client
 * ships data, not a parser.
 *
 * Validation happens here too, for the same reason one step further on.
 * The configs used to be emitted raw and run through the zod schema in the
 * browser, on the theory that one schema should guard both paths — but
 * what that bought was a second, identical check of a file that cannot
 * change between the two, at the cost of shipping a validator on the
 * critical path of every page, since a config lookup sits behind the score
 * weights nearly every figure on the site is derived from. Validating at
 * build time keeps the single schema and the hard failure, and moves both
 * to the only moment either can still tell anyone anything: an invalid
 * config now fails `pnpm build` instead of a reader's tab.
 *
 * The epic registry rides along in the same module, because the switcher
 * in the sidebar needs to know which epics exist and which is the default,
 * and epics.yaml is read with `fs` (Node-only) exactly like the configs.
 *
 * The raw YAML *text* is a second module (`virtual:app-config/sources`),
 * not another export of this one. Only the Config page renders it, and an
 * export of this module would be pinned into the shared chunk every page
 * loads by the imports around it — about 15KB of YAML today, and one more
 * file's worth for every epic added.
 */
export function appConfigPlugin(): Plugin {
  const resolved = (id: string) => `\0${id}`;
  // Absolute, and resolved against the repo root rather than this file:
  // a virtual module has no directory of its own, so a relative path gets
  // resolved against the virtual id and fails.
  const abs = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

  /** Reads and validates one epic's config, naming the file and the
   *  offending fields — a zod error against an anonymous object is
   *  near-useless for finding which epic's YAML is wrong. */
  function readConfig(slug: string): { source: string; config: unknown } {
    const path = epicConfigPath(slug);
    const source = readFileSync(abs(path), "utf8");
    const result = Config.safeParse(parse(source));
    if (!result.success) {
      throw new Error(
        `Invalid ${path}:\n${result.error.issues
          .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n")}`,
      );
    }
    return { source, config: result.data };
  }

  return {
    name: "app-config-yaml",
    resolveId(id) {
      if (id === VIRTUAL_ID) return resolved(VIRTUAL_ID);
      if (id === SOURCES_ID) return resolved(SOURCES_ID);
      return null;
    },
    load(id) {
      if (id !== resolved(VIRTUAL_ID) && id !== resolved(SOURCES_ID)) return null;

      const registry = loadEpicRegistry();
      // Watched so editing a config (or the registry) hot-reloads in dev
      // rather than silently serving a stale copy until the next restart.
      this.addWatchFile(abs(EPICS_REGISTRY_PATH));
      for (const slug of registry.epics) this.addWatchFile(abs(epicConfigPath(slug)));

      if (id === resolved(SOURCES_ID)) {
        const sources = Object.fromEntries(registry.epics.map((slug) => [slug, readConfig(slug).source]));
        return `export const appConfigSources = ${JSON.stringify(sources)};`;
      }

      const configs = Object.fromEntries(registry.epics.map((slug) => [slug, readConfig(slug).config]));

      // JIRA_BASE_URL is a host, not a secret (no token/email baked in) —
      // safe to ship to the client. Null when unset, so a checkout without
      // .env.local just renders tickets unlinked instead of failing the
      // build. Shared across epics: they're all the same JIRA site.
      const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "") ?? null;
      return [
        `export const epicRegistry = ${JSON.stringify(registry)};`,
        `export const appConfigs = ${JSON.stringify(configs)};`,
        `export const jiraBaseUrl = ${JSON.stringify(jiraBaseUrl)};`,
      ].join("\n");
    },
  };
}
