import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractAcBullets, extractOverview } from "../src/lib/adf.ts";

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

function doc(...content: unknown[]) {
  return { type: "doc", version: 1, content };
}

function heading(text: string) {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

describe("extractOverview", () => {
  it("takes the prose under a Goal heading", () => {
    const description = doc(
      heading("Goal"),
      paragraph("Validate the survey template before creation."),
      heading("Acceptance Criteria"),
      paragraph("Should not appear."),
    );
    expect(extractOverview(description)).toBe("Validate the survey template before creation.");
  });

  it("also matches the 'What it delivers' heading milestones use", () => {
    const description = doc(heading("What it delivers"), paragraph("Bulk-management tools."));
    expect(extractOverview(description)).toBe("Bulk-management tools.");
  });

  it("matches the heading case-insensitively", () => {
    expect(extractOverview(doc(heading("GOAL"), paragraph("Shouty.")))).toBe("Shouty.");
  });

  it("joins multiple paragraphs in the same section", () => {
    const description = doc(heading("Goal"), paragraph("First."), paragraph("Second."), heading("Next"));
    expect(extractOverview(description)).toBe("First.\n\nSecond.");
  });

  it("stops at the next heading rather than running into it", () => {
    const description = doc(
      heading("Goal"),
      paragraph("Wanted."),
      heading("Out of Scope"),
      paragraph("Not wanted."),
    );
    expect(extractOverview(description)).not.toMatch(/Not wanted/);
  });

  it("falls back to the leading paragraphs when there is no recognised heading", () => {
    const description = doc(paragraph("A ticket with no template."), heading("Notes"), paragraph("Ignored."));
    expect(extractOverview(description)).toBe("A ticket with no template.");
  });

  it("returns an empty string, and does not throw, for a missing description", () => {
    expect(extractOverview(null)).toBe("");
    expect(extractOverview(undefined)).toBe("");
    expect(extractOverview({ type: "doc" })).toBe("");
  });

  it("ignores bullet lists, which belong to extractAcBullets", () => {
    const description = doc(heading("Goal"), {
      type: "bulletList",
      content: [{ type: "listItem", content: [paragraph("a bullet")] }],
    });
    expect(extractOverview(description)).toBe("");
  });
});
