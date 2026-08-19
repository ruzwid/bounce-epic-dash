import { defineConfig, type Plugin } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import { appConfigPlugin } from "./build/app-config-plugin";

loadDotenv({ path: ".env.local" });

export default defineConfig({
  // The same plugin the app builds with, not a copy of it. The copy that
  // used to live here drifted the moment vite.config.ts changed, and the
  // tests went on passing against a virtual module the app no longer had.
  //
  // The cast is the price of that: vitest 2 bundles Vite 5 and the app
  // builds on Vite 8, so the two `Plugin` types are structurally
  // compatible but nominally different declarations of the same shape.
  // It goes here, at the one seam, rather than being avoided by keeping
  // two copies of the plugin in sync by hand.
  plugins: [appConfigPlugin() as unknown as Plugin],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
