import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { StatusSnapshot as StatusSnapshotSchema } from "../../src/lib/schema.ts";
import { approvedWithoutProof, bySignOffStage, signOffStage, signOffView, totalAc } from "../../src/lib/dashboard/signoff.ts";

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

type FeatureInput = {
  key: string;
  stage?: string;
  signedOff?: boolean;
  awaitingSignOff?: boolean;
  statuses?: string[];
  ac?: ("covered" | "partial" | "no_signal")[];
  gate?: "open" | "merged" | "not_found" | null;
};

function feature({
  key,
  stage = "underway",
  signedOff = false,
  awaitingSignOff = false,
  statuses = ["todo"],
  ac = [],
  gate = null,
}: FeatureInput) {
  return {
    key,
    code: key,
    title: key,
    owner: "Alice",
    stage,
    signedOff,
    awaitingSignOff,
    acCoverage: ac.map((coverage, i) => ({ id: `ac-${i}`, label: "x", coverage, evidence: [] })),
    releaseGate: gate ? { integrationBranch: "release/x", pr: null, status: gate } : null,
    stories: statuses.map((status, i) => ({ key: `${key}-S${i}`, summary: "s", status })),
  };
}

function snapshot(features: ReturnType<typeof feature>[]): StatusSnapshotT {
  return { date: "2026-08-14", features } as unknown as StatusSnapshotT;
}

describe("signOffStage", () => {
  it("puts an approved feature at the end of the flow", () => {
    expect(signOffStage(feature({ key: "F1", signedOff: true }) as never)).toBe("signed_off");
  });

  it("puts a feature in Product Review with product", () => {
    expect(signOffStage(feature({ key: "F1", awaitingSignOff: true }) as never)).toBe("with_product");
  });

  it("counts Done-without-proof as code complete — a ticket closed without a PR still left engineering", () => {
    const f = feature({ key: "F1", statuses: ["shipped", "done_unverified"] });
    expect(signOffStage(f as never)).toBe("code_complete");
  });

  it("leaves anything with work in flight as still building", () => {
    expect(signOffStage(feature({ key: "F1", statuses: ["shipped", "in_review"] }) as never)).toBe("building");
  });

  it("infers signed-off from stage 'done' plus an unshipped story, for snapshots predating the flags", () => {
    // deriveStage (src/lib/score.ts) can only reach "done" without every
    // story shipped via the signedOff override, so this combination is
    // proof of a legacy sign-off even when the flags themselves default to
    // false — this is how the retired "Product Sign Off" field's
    // approvals still count without a re-collect.
    expect(signOffStage(feature({ key: "F1", stage: "done", statuses: ["todo"] }) as never)).toBe("signed_off");
  });

  it("falls back to code complete when stage 'done' is ambiguous (every story already shipped)", () => {
    expect(signOffStage(feature({ key: "F1", stage: "done", statuses: ["shipped"] }) as never)).toBe("code_complete");
  });
});

describe("signOffView", () => {
  it("flags a signed-off feature whose stories were never seen on master", () => {
    const view = signOffView(
      snapshot([
        feature({ key: "F1", signedOff: true, statuses: ["shipped", "done_unverified", "done_unverified"] }),
        feature({ key: "F2", signedOff: true, statuses: ["shipped"] }),
      ]),
    );

    const flagged = approvedWithoutProof(view);
    expect(flagged.map((f) => f.feature.key)).toEqual(["F1"]);
    expect(flagged[0]!.unverified).toHaveLength(2);
  });

  it("reports an unresolved release gate, and does not treat a merged one as open", () => {
    const view = signOffView(
      snapshot([feature({ key: "F1", gate: "open" }), feature({ key: "F2", gate: "merged" }), feature({ key: "F3" })]),
    );
    expect(view.map((f) => f.gateOpen)).toEqual([true, false, false]);
  });

  it("rolls acceptance criteria up per feature and across the epic", () => {
    const view = signOffView(
      snapshot([
        feature({ key: "F1", ac: ["covered", "covered", "partial"] }),
        feature({ key: "F2", ac: ["no_signal"] }),
      ]),
    );

    expect(view[0]!.ac).toEqual({ covered: 2, partial: 1, noSignal: 0, total: 3 });
    expect(totalAc(view)).toEqual({ covered: 2, partial: 1, noSignal: 1, total: 4 });
  });

  it("groups by stage without losing anyone", () => {
    const view = signOffView(
      snapshot([
        feature({ key: "F1", signedOff: true }),
        feature({ key: "F2", awaitingSignOff: true }),
        feature({ key: "F3", statuses: ["in_progress"] }),
      ]),
    );

    const counted =
      bySignOffStage(view, "signed_off").length +
      bySignOffStage(view, "with_product").length +
      bySignOffStage(view, "code_complete").length +
      bySignOffStage(view, "building").length;
    expect(counted).toBe(view.length);
  });
});
