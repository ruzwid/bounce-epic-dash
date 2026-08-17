import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import { parse } from "yaml";
import { config as loadDotenv } from "dotenv";
import { EPICS_REGISTRY_PATH, epicConfigPath, loadEpicRegistry } from "./src/lib/epics";

loadDotenv({ path: ".env.local" });

// Virtual module for app config — same as in vite.config.ts. Every epic's
// config, keyed by slug, plus the registry the switcher reads. Kept a
// duplicate rather than imported from vite.config.ts on purpose: that file
// pulls in the whole TanStack Start / Nitro plugin chain, which a node
// test run has no business loading.
function appConfigPlugin(): Plugin {
  const virtualId = "virtual:app-config";
  const resolvedId = `\0${virtualId}`;
  const abs = (path: string) => fileURLToPath(new URL(`./${path}`, import.meta.url));

  return {
    name: "app-config-yaml",
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;

      const registry = loadEpicRegistry();
      this.addWatchFile(abs(EPICS_REGISTRY_PATH));

      const configs: Record<string, unknown> = {};
      const sources: Record<string, string> = {};
      for (const slug of registry.epics) {
        const path = abs(epicConfigPath(slug));
        this.addWatchFile(path);
        const source = readFileSync(path, "utf8");
        configs[slug] = parse(source);
        sources[slug] = source;
      }

      const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "") ?? null;
      return [
        `export const epicRegistry = ${JSON.stringify(registry)};`,
        `export const appConfigs = ${JSON.stringify(configs)};`,
        `export const appConfigSources = ${JSON.stringify(sources)};`,
        `export const jiraBaseUrl = ${JSON.stringify(jiraBaseUrl)};`,
      ].join("\n");
    },
  };
}

export default defineConfig({
  plugins: [appConfigPlugin()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
