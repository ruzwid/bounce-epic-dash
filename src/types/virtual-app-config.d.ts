// Types for the `virtual:app-config` modules produced by appConfigPlugin()
// in vite.config.ts.
//
// `appConfigs` is typed as the validated shape because it *is* validated —
// the plugin runs each config through the same zod schema at build time and
// fails the build on a bad one, so nothing downstream needs to re-check it
// (and the browser never loads zod to do so). See the note on the plugin.
//
// Everything here is keyed by epic slug: these modules are how the browser
// sees every epic's config, since the YAML itself is read with `fs` at
// build time and never shipped to a client.
declare module "virtual:app-config" {
  export const epicRegistry: { default: string; epics: string[] };
  export const appConfigs: Record<string, import("../lib/config-schema").Config>;
  export const jiraBaseUrl: string | null;
}

// Separate module so the raw YAML text code-splits with the Config page,
// the only thing that renders it, instead of riding in the shared chunk
// every page loads.
declare module "virtual:app-config/sources" {
  export const appConfigSources: Record<string, string>;
}
