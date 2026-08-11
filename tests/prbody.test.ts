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

  it("correctly splits sections and drops boilerplate on real CRLF-terminated GitHub bodies", () => {
    // GitHub PR bodies commonly come back CRLF. JS regex `.` treats \r as
    // a line terminator, which used to silently break the heading regex's
    // trailing `$` anchor on every line, making the whole body (including
    // Testing/Related boilerplate) pass through uncleaned.
    const crlfBody =
      "## Context\r\n\r\nSome real context here.\r\n\r\n## What changed\r\n\r\n- did a thing\r\n\r\n" +
      '## Testing\r\n\r\n<img width="370" height="179" alt="image" src="https://example.com/x.png" />\r\n\r\n' +
      "## Related\r\n\r\n- dashboard-api: https://github.com/bounceinsights/dashboard-api/pull/2066\r\n";
    const result = cleanPrBody(crlfBody);
    expect(result.body).toMatch(/Some real context here/);
    expect(result.body).toMatch(/did a thing/);
    expect(result.body).not.toMatch(/Related|dashboard-api|Testing/);
    expect(result.body).not.toMatch(/<img/);
  });

  it("strips raw <img> tags (GitHub's pasted-screenshot HTML), not just markdown image syntax", () => {
    const body = '## Context\n\nHere is a screenshot:\n\n<img width="300" src="https://example.com/shot.png" alt="screenshot" />\n\nThat confirms the fix.';
    const result = cleanPrBody(body);
    expect(result.body).not.toMatch(/<img/);
    expect(result.body).toMatch(/confirms the fix/);
  });
});
