// src/lib/epics.ts
// The one place that knows how an epic slug maps onto the filesystem.
//
// A slug is three things at once — the directory under epics/ holding that
// epic's config, the sub-directory its data files live in under data/, and
// its URL segment on the site — so every path is built here rather than
// string-concatenated at each call site. Node-only (reads epics.yaml with
// `fs`); the browser gets the same registry through the
// `virtual:app-config` module instead. See src/lib/dashboard/appConfig.ts.
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const EpicRegistry = z.object({
  /** The slug "/" resolves to, and what the scripts use with no --epic
   *  flag. Must appear in `epics` below — checked by loadEpicRegistry. */
  default: z.string().min(1),
  /** Every tracked epic, in the order the switcher lists them. */
  epics: z.array(z.string().min(1)).min(1),
});

export type EpicRegistry = z.infer<typeof EpicRegistry>;

export const EPICS_REGISTRY_PATH = "epics.yaml";

/** Reads and validates epics.yaml. Throws with a clear message rather than
 *  degrading — a dashboard that can't tell which epics exist has nothing
 *  useful to do. */
export function loadEpicRegistry(path = EPICS_REGISTRY_PATH): EpicRegistry {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Could not read the epic registry at "${path}": ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in "${path}": ${(err as Error).message}`);
  }

  const result = EpicRegistry.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid ${path}:\n${result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
    );
  }

  const registry = result.data;
  if (!registry.epics.includes(registry.default)) {
    throw new Error(
      `Invalid ${path}: default epic "${registry.default}" is not listed in epics: [${registry.epics.join(", ")}].`,
    );
  }
  // A duplicated slug would silently give one epic two switcher entries
  // pointing at the same data.
  const seen = new Set<string>();
  for (const slug of registry.epics) {
    if (seen.has(slug)) throw new Error(`Invalid ${path}: epic slug "${slug}" is listed more than once.`);
    seen.add(slug);
  }

  return registry;
}

/** The slug to operate on: `requested` if it's a real epic, otherwise the
 *  registry default. An unknown slug is a hard error naming the valid ones
 *  — a typo must never silently collect the wrong team's epic over the
 *  right one's snapshot. */
export function resolveEpicSlug(requested?: string | null, registry: EpicRegistry = loadEpicRegistry()): string {
  if (!requested) return registry.default;
  if (!registry.epics.includes(requested)) {
    throw new Error(
      `Unknown epic "${requested}". Known epics: ${registry.epics.join(", ")}. ` +
        `Add it to ${EPICS_REGISTRY_PATH} and create epics/${requested}/config.yaml first.`,
    );
  }
  return requested;
}

/** `--epic <slug>` / `--epic=<slug>` out of argv. Returns null when absent,
 *  which resolveEpicSlug reads as "use the default". */
export function epicFlag(argv: string[]): string | null {
  const inline = argv.find((arg) => arg.startsWith("--epic="));
  if (inline) return inline.slice("--epic=".length) || null;
  const index = argv.indexOf("--epic");
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error("--epic needs a slug, e.g. --epic wpp-at-scale");
  }
  return value;
}

export function epicDir(slug: string): string {
  return `epics/${slug}`;
}

export function epicConfigPath(slug: string): string {
  return `${epicDir(slug)}/config.yaml`;
}

export function epicOverridesPath(slug: string): string {
  return `${epicDir(slug)}/overrides.yaml`;
}

/** Where one run's file for `kind` lives. Every one of these is scoped by
 *  epic so two teams collecting on the same day can never overwrite each
 *  other — and so `git add data/snapshots/<slug>` in one team's routine is
 *  incapable of staging the other's. */
export function epicDataPath(
  kind: "raw" | "pending" | "judgment" | "snapshots",
  slug: string,
  date: string,
): string {
  return `data/${kind}/${slug}/${date}.json`;
}
