import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHeroSummary, type HeroClause } from "../../src/lib/dashboard/hero.ts";
import { computeChanges } from "../../src/lib/dashboard/diff.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

const FIXTURES = new URL("./fixtures/snapshots/", import.meta.url);

function loadFixture(name: string) {
  return StatusSnapshot.parse(JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")));
}

const previous = loadFixture("2026-08-10.json");
const current = loadFixture("2026-08-11.json");
const changes = computeChanges(current, previous);

const said = (clauses: HeroClause[]) => clauses.map((c) => `${c.count} ${c.noun} ${c.tail}`.trim());

describe("buildHeroSummary", () => {
  it("counts each kind of movement once, dropping the kinds that didn't happen", () => {
    const summary = buildHeroSummary(current, changes);
    expect(said(summary.movement)).toContain("1 story shipped");
    expect(said(summary.movement)).toContain("1 story marked Done without a PR");
    // Nothing was staged or sent to product between these snapshots, so
    // neither clause should appear at all rather than reading "0".
    expect(said(summary.movement).some((l) => l.startsWith("0"))).toBe(false);
    expect(said(summary.movement).some((l) => l.includes("sent to product"))).toBe(false);
  });

  it("keeps story regressions and feature slips as separate clauses", () => {
    // F1.2 slips a stage between these fixtures and no story regresses, so
    // the sentence names the level that came apart rather than folding
    // both into an ambiguous "1 moved backwards".
    expect(said(buildHeroSummary(current, changes).movement)).toContain("1 feature slipped");
  });

  it("reports nothing as movement when nothing changed", () => {
    const summary = buildHeroSummary(current, []);
    expect(summary.movement).toEqual([]);
    // Standing facts are about today, not about the gap, so they survive.
    expect(summary.standing.length).toBeGreaterThan(0);
  });

  it("counts review requests, not stories in review", () => {
    // The two genuinely differ, and reading one as the other is what made
    // the page say "10 reviews are waiting" beside "12 in review". One
    // open PR with two reviewers is two people who owe something, and one
    // story. This sentence is about the people.
    const pr = current.features.flatMap((f) => f.stories).flatMap((s) => s.prs)[0]!;
    const withQueue = {
      ...current,
      kpis: { ...current.kpis, inReview: 1 },
      reviewQueue: ["ana", "bo"].map((reviewer) => ({
        pr,
        featureKey: "BOUN-100",
        reviewer,
        requestedAt: "2026-08-10T00:00:00.000Z",
        ageDays: 1,
      })),
    };
    const reviews = buildHeroSummary(withQueue, []).standing.find((c) => c.noun.includes("review"));
    expect(reviews?.count).toBe(2);
  });

  it("counts features waiting on product as a standing fact", () => {
    const waiting = {
      ...current,
      features: current.features.map((f) => (f.key === "BOUN-100" ? { ...f, awaitingSignOff: true } : f)),
    };
    expect(said(buildHeroSummary(waiting, []).standing)).toContain("1 feature is with product");
  });

  it("gives every clause an icon and a status hue to draw itself in", () => {
    const summary = buildHeroSummary(current, changes);
    for (const clause of [...summary.movement, ...summary.standing]) {
      expect(clause.icon).toBeTruthy();
      expect(clause.status).toBeTruthy();
    }
  });

  it("singularises every clause it prints", () => {
    const summary = buildHeroSummary(current, changes);
    for (const clause of [...summary.movement, ...summary.standing]) {
      if (clause.count !== 1) continue;
      expect(`${clause.noun} ${clause.tail}`).not.toMatch(/\bstories\b|\bfeatures\b|reviews are/);
    }
  });
});
