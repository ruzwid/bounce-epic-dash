import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import { parse } from "yaml";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

// Virtual module for app config — same as in vite.config.ts
function appConfigPlugin(): Plugin {
  const virtualId = "virtual:app-config";
  const resolvedId = `\0${virtualId}`;
  const configPath = fileURLToPath(new URL("./config.yaml", import.meta.url));

  return {
    name: "app-config-yaml",
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const source = readFileSync(configPath, "utf8");
      this.addWatchFile(configPath);
      const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "") ?? null;
      return [
        `export const appConfig = ${JSON.stringify(parse(source))};`,
        `export const appConfigSource = ${JSON.stringify(source)};`,
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
