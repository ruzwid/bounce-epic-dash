// Types for the `virtual:app-config` module produced by appConfigPlugin()
// in vite.config.ts. Deliberately loose here — src/lib/dashboard/appConfig.ts
// runs the value through the zod Config schema, which is what actually
// guarantees the shape.
declare module "virtual:app-config" {
  export const appConfig: unknown;
  export const appConfigSource: string;
  export const jiraBaseUrl: string | null;
}
