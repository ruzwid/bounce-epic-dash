import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractAcBullets } from "../src/lib/adf.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

describe("extractAcBullets", () => {
  it("extracts only the bullets under the Acceptance Criteria heading", () => {
    const doc = JSON.parse(readFileSync(new URL("adf-description.json", FIXTURES), "utf-8"));
    const bullets = extractAcBullets(doc);
    expect(bullets).toEqual([
      "User can select multiple buckets at once.",
      "Bulk actions apply within 2 seconds for up to 500 rows.",
      "A confirmation toast appears on success.",
    ]);
  });

  it("does not include content from a subsequent heading's section", () => {
    const doc = JSON.parse(readFileSync(new URL("adf-description.json", FIXTURES), "utf-8"));
    const bullets = extractAcBullets(doc);
    expect(bullets.join(" ")).not.toMatch(/NOT be picked up/);
  });

  it("returns an empty array, and does not throw, when there is no AC heading", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Just a plain description." }] },
      ],
    };
    expect(extractAcBullets(doc)).toEqual([]);
  });

  it("returns an empty array for a null/empty description without throwing", () => {
    expect(extractAcBullets(null)).toEqual([]);
    expect(extractAcBullets(undefined)).toEqual([]);
  });
});
