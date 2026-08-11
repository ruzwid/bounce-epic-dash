import { describe, expect, it } from "vitest";
import { loadConfig, loadOverrides, logicalDate } from "../src/lib/config.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

describe("loadConfig", () => {
  it("loads and validates a well-formed config.yaml", () => {
    const config = loadConfig(new URL("config.valid.yaml", FIXTURES).pathname);
    expect(config.epic.key).toBe("TEST-1");
    expect(config.jira.projectKey).toBe("TEST");
    expect(config.github.org).toBe("test-org");
    expect(config.milestones).toHaveLength(1);
    expect(config.milestones[0]?.features[0]?.key).toBe("TEST-10");
    expect(config.people.alice).toBe("Alice");
  });

  it("throws a clear, field-naming error when a required section is missing", () => {
    expect(() => loadConfig(new URL("config.invalid.yaml", FIXTURES).pathname)).toThrow(/github/);
  });

  it("throws a clear error when the file does not exist", () => {
    expect(() => loadConfig(new URL("does-not-exist.yaml", FIXTURES).pathname)).toThrow(
      /Could not read config file/,
    );
  });
});

describe("loadOverrides", () => {
  it("returns an empty object when overrides.yaml does not exist", () => {
    expect(loadOverrides(new URL("does-not-exist.yaml", FIXTURES).pathname)).toEqual({});
  });
});

describe("logicalDate", () => {
  it("uses the configured timezone's calendar day, not UTC's, during Irish Summer Time", () => {
    // 2026-06-30T23:30:00Z is 2026-07-01T00:30:00+01:00 in Dublin (IST/DST).
    // A naive `date.toISOString().slice(0,10)` would return 2026-06-30 (wrong day).
    const instant = new Date("2026-06-30T23:30:00.000Z");
    expect(logicalDate("Europe/Dublin", instant)).toBe("2026-07-01");
  });

  it("a 00:30 local Dublin run does not roll forward to tomorrow", () => {
    // 2026-07-01T00:30:00+01:00 Dublin, expressed directly in UTC.
    const instant = new Date("2026-06-30T23:30:00.000Z");
    expect(logicalDate("Europe/Dublin", instant)).not.toBe("2026-07-02");
    expect(logicalDate("Europe/Dublin", instant)).toBe("2026-07-01");
  });

  it("matches UTC's calendar day during winter (GMT, no offset)", () => {
    const instant = new Date("2026-01-15T23:45:00.000Z");
    expect(logicalDate("Europe/Dublin", instant)).toBe("2026-01-15");
  });
});
