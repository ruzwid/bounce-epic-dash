import { describe, expect, it } from "vitest";
import { cleanPrBody } from "../src/lib/prbody.ts";
import {
  FILLED_BODY,
  LONG_BODY_CONTEXT,
  PLAIN_UNSTRUCTURED_BODY,
  UNFILLED_TEMPLATE_BODY,
} from "./fixtures/pr-bodies.ts";

describe("cleanPrBody", () => {
  it("a filled-in body survives cleaning with its real content intact", () => {
    const result = cleanPrBody(FILLED_BODY);
    expect(result.body).not.toBeNull();
    expect(result.body).toMatch(/mismatched\s+demographic\s+questions/);
    expect(result.body).toMatch(/validateDemographicQuestions/);
    expect(result.bodyTruncated).toBe(false);
    expect(result.bodySignal).toBeNull();
  });

  it("drops the review-tool Testing/Functionality Review boilerplate from a filled body", () => {
    const result = cleanPrBody(FILLED_BODY);
    expect(result.body).not.toMatch(/Repository to Pull From/);
    expect(result.body).not.toMatch(/Impact on Repositories/);
    expect(result.body).not.toMatch(/review-tool dashboard 1234/);
  });

  it("strips HTML comments and trailing bot signatures from a filled body", () => {
    const result = cleanPrBody(FILLED_BODY);
    expect(result.body).not.toMatch(/<!--/);
    expect(result.body).not.toMatch(/Generated with/);
    expect(result.body).not.toMatch(/🤖/);
  });

  it("an unfilled template body yields bodySignal 'template_only'", () => {
    const result = cleanPrBody(UNFILLED_TEMPLATE_BODY);
    expect(result.body).toBeNull();
    expect(result.bodySignal).toBe("template_only");
    expect(result.bodyTruncated).toBe(false);
  });

  it("treats a null/empty body as template_only rather than throwing", () => {
    expect(cleanPrBody(null)).toEqual({ body: null, bodyTruncated: false, bodySignal: "template_only" });
    expect(cleanPrBody("")).toEqual({ body: null, bodyTruncated: false, bodySignal: "template_only" });
    expect(cleanPrBody("   \n\n  ")).toEqual({ body: null, bodyTruncated: false, bodySignal: "template_only" });
  });

  it("keeps a plain, unstructured body with no headings at all", () => {
    const result = cleanPrBody(PLAIN_UNSTRUCTURED_BODY);
    expect(result.body).toContain("flaky CI job");
    expect(result.bodySignal).toBeNull();
  });

  it("caps cleaned content at 1500 chars and marks bodyTruncated", () => {
    const longBody = `## Changes\n\n### Context\n\n${LONG_BODY_CONTEXT}\n`;
    const result = cleanPrBody(longBody);
    expect(result.body).not.toBeNull();
    expect(result.body!.length).toBeLessThanOrEqual(1500);
    expect(result.bodyTruncated).toBe(true);
  });

  it("does not truncate content under the 1500 char cap", () => {
    const result = cleanPrBody(FILLED_BODY);
    expect(result.bodyTruncated).toBe(false);
  });
});
