import type { RawPr } from "../../src/lib/classify.ts";

/** Fixture builder for a RawPr with sensible defaults, override anything. */
export function makePr(overrides: Partial<RawPr> & { number: number }): RawPr {
  return {
    repo: "dashboard",
    title: `PR #${overrides.number}`,
    state: "OPEN",
    isDraft: false,
    baseRefName: "master",
    headRefName: `branch-${overrides.number}`,
    mergedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    reviewRequests: [],
    reviews: [],
    author: null,
    filesTouched: [],
    body: null,
    ...overrides,
  };
}
