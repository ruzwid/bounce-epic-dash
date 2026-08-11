// src/lib/config.ts
// Loads and validates config.yaml and overrides.yaml. Fails loudly with a
// clear, field-naming message on any missing/invalid field — this is meant
// to be the first thing that breaks, not something that silently degrades.
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";
import { Config, OverridesFile } from "./config-schema.ts";
import type { Config as ConfigT, OverridesFile as OverridesFileT } from "./config-schema.ts";

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

function readYamlFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Could not read config file at "${path}": ${(err as Error).message}`);
  }
  try {
    return parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in "${path}": ${(err as Error).message}`);
  }
}

/** Loads and validates config.yaml. Throws with a clear message naming the
 *  offending field(s) on any missing or invalid value. */
export function loadConfig(path = "config.yaml"): ConfigT {
  const parsed = readYamlFile(path);
  const result = Config.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid ${path}:\n${formatZodError(result.error)}`);
  }
  return result.data;
}

/** Loads and validates overrides.yaml. Missing file is not an error — it's
 *  an optional, human-maintained file — and is treated as no overrides. */
export function loadOverrides(path = "overrides.yaml"): OverridesFileT {
  let parsed: unknown;
  try {
    parsed = readYamlFile(path);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Could not read config file")) {
      return {};
    }
    throw err;
  }
  const result = OverridesFile.safeParse(parsed ?? {});
  if (!result.success) {
    throw new Error(`Invalid ${path}:\n${formatZodError(result.error)}`);
  }
  return result.data;
}

/** The logical calendar date (YYYY-MM-DD) for `now` in `timezone`. Always
 *  use this for snapshot filenames and idempotency checks — never
 *  `Date#toISOString`, which is UTC and drifts from the configured zone
 *  around midnight (e.g. a 00:30 Dublin run during DST is still 23:30 UTC
 *  the previous day). */
export function logicalDate(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, exactly the shape schema.ts's z.string().date() expects.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
