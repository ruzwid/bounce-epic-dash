import { describe, expect, it } from "vitest";
import { featureAnchorId } from "../../src/lib/dashboard/anchors.ts";

describe("featureAnchorId", () => {
  it("converts a dotted code to a dashed, lowercase id", () => {
    expect(featureAnchorId("F1.1")).toBe("f1-1");
  });

  it("handles multi-dot codes", () => {
    expect(featureAnchorId("DF4.1.1")).toBe("df4-1-1");
  });

  it("passes through a code with no dots, just lowercased", () => {
    expect(featureAnchorId("M3")).toBe("m3");
  });
});
