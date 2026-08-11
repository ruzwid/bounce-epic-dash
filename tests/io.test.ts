import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJsonAtomic } from "../src/lib/io.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "io-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  it("writes valid JSON and leaves no .tmp file behind", () => {
    const path = join(dir, "2026-01-01.json");
    writeJsonAtomic(path, { hello: "world" });
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ hello: "world" });
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("a same-day rerun overwrites the file rather than appending to it", () => {
    const path = join(dir, "2026-01-01.json");
    writeJsonAtomic(path, { revision: 1 });
    writeJsonAtomic(path, { revision: 2 });
    const content = readFileSync(path, "utf-8");
    expect(JSON.parse(content)).toEqual({ revision: 2 });
    // A naive append bug would produce two concatenated JSON objects, which
    // wouldn't parse as a single value at all.
    expect(content.trim().split("\n}").length).toBeLessThanOrEqual(2);
  });

  it("creates the parent directory if it doesn't exist", () => {
    const path = join(dir, "nested", "deeper", "file.json");
    writeJsonAtomic(path, { ok: true });
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ ok: true });
  });
});
