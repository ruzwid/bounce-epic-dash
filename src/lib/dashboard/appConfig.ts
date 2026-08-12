// src/lib/dashboard/appConfig.ts
// The pipeline's config.yaml, made readable from the browser.
//
// src/lib/config.ts reads the same file with `fs` for the Node collection
// scripts; that can't work in a prerendered page or after hydration. The
// `virtual:app-config` module (see appConfigPlugin in vite.config.ts)
// resolves the YAML to plain JS at build time instead, so no parser ships
// to the client. Both paths validate through the same zod schema, so a
// config the pipeline accepts and a config this page renders can never
// diverge.
//
// config.yaml holds no secrets by construction — credentials live in
// .env.local, which is gitignored and never imported here.
import { appConfig, appConfigSource } from "virtual:app-config";
import { Config } from "../config-schema.ts";

export type AppConfig = Config;

/** The raw YAML text, for showing the file as it is actually written —
 *  comments and all, which is most of the documentation this file has. */
export const configSource: string = appConfigSource;

let parsed: Config | null = null;

/** Validated config. Parsed once and memoised: several components read it
 *  and there's no reason to re-run zod for each. */
export function loadAppConfig(): Config {
  parsed ??= Config.parse(appConfig);
  return parsed;
}

let loginsByDisplayName: Map<string, string> | null = null;

/** The GitHub login behind a display name, or null if config.yaml doesn't
 *  map one.
 *
 *  Snapshots store `feature.owner` already humanised (scripts/merge.ts
 *  swaps the login for `config.people[login]`), so going the other way is
 *  the only route from a rendered name back to an avatar. Reviewers need
 *  none of this — GitHub review requests are logins to begin with.
 *
 *  Reads the `people` block directly rather than going through
 *  loadAppConfig(): owner avatars render on nearly every page, and a
 *  config that fails full validation should break the Config page, not
 *  take down the whole dashboard over a missing profile picture. */
export function loginForDisplayName(displayName: string): string | null {
  if (!loginsByDisplayName) {
    const people = (appConfig as { people?: Record<string, unknown> } | null)?.people ?? {};
    loginsByDisplayName = new Map(
      Object.entries(people)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([login, name]) => [name, login]),
    );
  }
  return loginsByDisplayName.get(displayName) ?? null;
}
