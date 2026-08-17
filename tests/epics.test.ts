import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  epicConfigPath,
  epicDataPath,
  epicFlag,
  epicOverridesPath,
  loadEpicRegistry,
  resolveEpicSlug,
} from "../src/lib/epics.ts";

function writeRegistry(body: string): string {
  const path = join(tmpdir(), `epics-${Math.random().toString(36).slice(2)}.yaml`);
  writeFileSync(path, body, "utf-8");
  return path;
}

describe("loadEpicRegistry", () => {
  it("reads the repo's real epics.yaml", () => {
    const registry = loadEpicRegistry();
    expect(registry.epics).toContain(registry.default);
    expect(registry.epics.length).toBeGreaterThan(0);
  });

  it("rejects a default that isn't one of the listed epics", () => {
    const path = writeRegistry("default: nope\nepics: [a, b]\n");
    expect(() => loadEpicRegistry(path)).toThrow(/default epic "nope" is not listed/);
  });

  it("rejects a duplicated slug, which would give one epic two switcher entries", () => {
    const path = writeRegistry("default: a\nepics: [a, b, a]\n");
    expect(() => loadEpicRegistry(path)).toThrow(/listed more than once/);
  });

  it("rejects an empty epic list rather than rendering a dashboard with nothing in it", () => {
    const path = writeRegistry("default: a\nepics: []\n");
    expect(() => loadEpicRegistry(path)).toThrow(/Invalid/);
  });

  it("names the file it could not read", () => {
    expect(() => loadEpicRegistry("/no/such/epics.yaml")).toThrow(/Could not read the epic registry/);
  });
});

describe("resolveEpicSlug", () => {
  const registry = { default: "wpp-at-scale", epics: ["wpp-at-scale", "research-efficiencies"] };

  it("falls back to the registry default when no epic is requested", () => {
    expect(resolveEpicSlug(undefined, registry)).toBe("wpp-at-scale");
    expect(resolveEpicSlug(null, registry)).toBe("wpp-at-scale");
  });

  it("returns a requested epic that exists", () => {
    expect(resolveEpicSlug("research-efficiencies", registry)).toBe("research-efficiencies");
  });

  it("throws on an unknown slug, listing the real ones — a typo must never silently collect the wrong epic", () => {
    expect(() => resolveEpicSlug("research-efficiency", registry)).toThrow(
      /Unknown epic "research-efficiency".*wpp-at-scale, research-efficiencies/s,
    );
  });
});

describe("epicFlag", () => {
  it("reads --epic <slug>", () => {
    expect(epicFlag(["--epic", "wpp-at-scale"])).toBe("wpp-at-scale");
  });

  it("reads --epic=<slug>", () => {
    expect(epicFlag(["--epic=wpp-at-scale"])).toBe("wpp-at-scale");
  });

  it("returns null when the flag is absent, so the default applies", () => {
    expect(epicFlag([])).toBeNull();
    expect(epicFlag(["--verbose"])).toBeNull();
  });

  it("throws rather than swallowing the next flag as a slug", () => {
    expect(() => epicFlag(["--epic", "--dry-run"])).toThrow(/--epic needs a slug/);
  });
});

describe("path helpers", () => {
  it("scopes config and overrides to the epic directory", () => {
    expect(epicConfigPath("wpp-at-scale")).toBe("epics/wpp-at-scale/config.yaml");
    expect(epicOverridesPath("wpp-at-scale")).toBe("epics/wpp-at-scale/overrides.yaml");
  });

  it("scopes every data file by epic, so two teams collecting on the same day can't overwrite each other", () => {
    expect(epicDataPath("raw", "a", "2026-08-17")).toBe("data/raw/a/2026-08-17.json");
    expect(epicDataPath("pending", "b", "2026-08-17")).toBe("data/pending/b/2026-08-17.json");
    expect(epicDataPath("judgment", "a", "2026-08-17")).toBe("data/judgment/a/2026-08-17.json");
    expect(epicDataPath("snapshots", "b", "2026-08-17")).toBe("data/snapshots/b/2026-08-17.json");
  });
});
