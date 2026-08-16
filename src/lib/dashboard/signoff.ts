// src/lib/dashboard/signoff.ts
// The epic read as a release pipeline, for the people who own the last
// gate rather than the code.
//
// The flow this models is the org's real one, as recorded in config.yaml:
//
//   in progress → code review → to be released → product review → done
//
// Engineering's view of a feature stops at "the code is on master". This
// one starts there: what is waiting on a product decision, what has been
// approved, and — the case worth catching — what has been approved while
// its own stories say the code was never verified as shipped.
import type { z } from "zod";
import type {
  AcCoverage as AcCoverageSchema,
  Feature as FeatureSchema,
  StatusSnapshot as StatusSnapshotSchema,
} from "../schema.ts";

type FeatureT = z.infer<typeof FeatureSchema>;
type AcCoverageT = z.infer<typeof AcCoverageSchema>;
type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>;

/** Where a feature sits relative to the product gate. Ordered as the flow
 *  runs, so a page can render the stages in sequence and mean it. */
export type SignOffStage = "building" | "code_complete" | "with_product" | "signed_off";

export const SIGN_OFF_STAGES: { id: SignOffStage; title: string; note: string }[] = [
  {
    id: "with_product",
    title: "With product",
    note: "Engineering is finished and the ticket is in Product Review. Product owes a decision.",
  },
  {
    id: "code_complete",
    title: "Code complete, not sent",
    note: "Every story is shipped or done, but the feature has not been put in front of product yet.",
  },
  {
    id: "signed_off",
    title: "Signed off",
    note: "Product approved it, which under the current flow means the ticket reached Done.",
  },
  {
    id: "building",
    title: "Still building",
    note: "Work is in flight — nothing for product to look at yet.",
  },
];

export type AcRollup = {
  covered: number;
  partial: number;
  noSignal: number;
  total: number;
};

export type SignOffFeature = {
  feature: FeatureT;
  stage: SignOffStage;
  ac: AcRollup;
  /** Stories JIRA calls Done that no pull request could confirm reached a
   *  default branch. On a signed-off feature these are what product
   *  approved without evidence — the single most useful thing this page
   *  says. */
  unverified: FeatureT["stories"];
  /** An unresolved release gate — code merged to an integration branch
   *  with no PR taking it to master. */
  gateOpen: boolean;
};

function rollUpAc(acCoverage: AcCoverageT[]): AcRollup {
  return {
    covered: acCoverage.filter((a) => a.coverage === "covered").length,
    partial: acCoverage.filter((a) => a.coverage === "partial").length,
    noSignal: acCoverage.filter((a) => a.coverage === "no_signal").length,
    total: acCoverage.length,
  };
}

/** Every story is finished as far as engineering is concerned — shipped,
 *  or Done-without-proof. "Code complete" has to accept the second kind,
 *  or a feature whose tickets were closed without a linked PR would sit in
 *  "still building" forever and never reach anyone. */
function codeComplete(feature: FeatureT): boolean {
  return (
    feature.stories.length > 0 &&
    feature.stories.every((s) => s.status === "shipped" || s.status === "done_unverified")
  );
}

/** deriveStage (src/lib/score.ts) only returns "done" without every story
 *  literally shipped when the feature was signed off — the non-signoff
 *  path to "done" requires allStoriesShippedToDefault. So this combination
 *  proves a sign-off even on a snapshot written before schemaVersion 3
 *  (signedOff/awaitingSignOff unpublished, defaulting to false on parse):
 *  it's how the retired "Product Sign Off" field's approvals still count
 *  here without a re-collect. */
function provablySignedOff(feature: FeatureT): boolean {
  const allShipped = feature.stories.length > 0 && feature.stories.every((s) => s.status === "shipped");
  return feature.stage === "done" && !allShipped;
}

export function signOffStage(feature: FeatureT): SignOffStage {
  if (feature.signedOff || provablySignedOff(feature)) return "signed_off";
  if (feature.awaitingSignOff) return "with_product";
  // A feature can reach stage "done" without the sign-off flags when the
  // snapshot predates them, so the stage is a fallback signal, not the
  // primary one.
  if (feature.stage === "done" || codeComplete(feature)) return "code_complete";
  return "building";
}

export function signOffView(snapshot: StatusSnapshotT): SignOffFeature[] {
  return snapshot.features.map((feature) => ({
    feature,
    stage: signOffStage(feature),
    ac: rollUpAc(feature.acCoverage),
    unverified: feature.stories.filter((s) => s.status === "done_unverified"),
    gateOpen: feature.releaseGate !== null && feature.releaseGate.status !== "merged",
  }));
}

export function bySignOffStage(features: SignOffFeature[], stage: SignOffStage): SignOffFeature[] {
  return features.filter((f) => f.stage === stage);
}

/** Features approved by product while their own stories say the code was
 *  never verified on a default branch. Not an accusation — a
 *  done_unverified story is often just a ticket closed without a linked
 *  PR — but it is exactly the pair of facts nobody sees otherwise, since
 *  the sign-off makes the feature read as finished everywhere else. */
export function approvedWithoutProof(features: SignOffFeature[]): SignOffFeature[] {
  return features.filter((f) => f.stage === "signed_off" && f.unverified.length > 0);
}

/** Acceptance-criteria coverage across a set of features, for the header
 *  figures. */
export function totalAc(features: SignOffFeature[]): AcRollup {
  return features.reduce<AcRollup>(
    (acc, f) => ({
      covered: acc.covered + f.ac.covered,
      partial: acc.partial + f.ac.partial,
      noSignal: acc.noSignal + f.ac.noSignal,
      total: acc.total + f.ac.total,
    }),
    { covered: 0, partial: 0, noSignal: 0, total: 0 },
  );
}
