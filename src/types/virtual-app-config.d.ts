// Types for the `virtual:app-config` module produced by appConfigPlugin()
// in vite.config.ts. Deliberately loose here — src/lib/dashboard/appConfig.ts
// runs the values through the zod Config schema, which is what actually
// guarantees the shape.
//
// Everything except the registry is keyed by epic slug: this module is how
// the browser sees every epic's config, since the YAML itself is read with
// `fs` at build time and never shipped to a client.
declare module "virtual:app-config" {
  export const epicRegistry: { default: string; epics: string[] };
  export const appConfigs: Record<string, unknown>;
  export const appConfigSources: Record<string, string>;
  export const jiraBaseUrl: string | null;
}
