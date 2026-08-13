# `done_unverified` Work Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third work status, `done_unverified`, so a JIRA "Done" ticket that GitHub cannot confirm landed on `master` (merged into a non-master branch, closed unmerged, or no linked PR at all) is neither silently trusted as `shipped` nor silently downgraded to `staged` — it earns full score credit (matching product sign-off) while staying visually and structurally distinct everywhere `shipped`/`staged` are distinct today.

**Architecture:** One new `WorkStatus` enum member threaded through the existing per-layer pattern: classification (`classify.ts`) → scoring (`score.ts`, `nav.ts`) → data pipeline (`collect.ts`, `merge.ts`) → display (CSS tokens, charts, KPI strips, change feed, Slack summary). No new abstractions — every layer already handles `shipped`/`staged` explicitly, so this plan extends each of those explicit lists by one entry.

**Tech Stack:** TypeScript, Zod, Vitest, React 19, Tailwind v4 (CSS custom properties), Recharts.

## Global Constraints

- New status name (schema, code, config key): `done_unverified` (snake_case, matching existing `WorkStatus` members).
- Display label (`statusLabels.ts`): `"Done, unverified"` — exact string, used verbatim in every UI surface.
- CSS custom property name: `--status-done-unverified` (light + dark), `--color-status-done-unverified` (theme-inline alias) — matches the existing `--status-<kebab-name>` convention.
- Score weight: `scoreWeights.done_unverified` in `config.yaml` = the same numeric value as `scoreWeights.shipped` (currently `1.0`) — full credit, per explicit product decision.
- `ScoreBasis`/`kpis` counts for `done_unverified` are tracked in their **own** field (`doneUnverified`), never merged into the `shipped` or `staged` counts, in any layer (scoring, charts, KPI strips, Slack summary).
- Zod fields for the two new numeric counters (`Feature.scoreBasis.doneUnverified`, `StatusSnapshot.kpis.doneUnverified`) use `.default(0)`, so historical `data/snapshots/*.json` files (written before this change) keep parsing without a backfill.
- `scoreWeights.done_unverified` in `config-schema.ts`'s `ScoreWeights` has **no** default — a missing weight in `config.yaml` must fail config load loudly, matching every other weight.
- The `"done"` Stage gate (`deriveStage`'s `allStoriesShippedToDefault` / `allShippedToDefault` / `allDone` checks) must keep comparing against the literal string `"shipped"` — never `"shipped" || "done_unverified"`. This is the safety valve; do not touch these comparisons.
- Run `pnpm test` after every task that touches a file with existing test coverage, before moving to the next task.

---

### Task 1: Schema, config, and label foundation

**Files:**
- Modify: `src/lib/schema.ts` (WorkStatus enum, `Feature.scoreBasis`, `StatusSnapshot.kpis`)
- Modify: `src/lib/config-schema.ts` (`ScoreWeights`)
- Modify: `config.yaml` (`scoreWeights`)
- Modify: `src/lib/dashboard/statusLabels.ts` (`WORK_STATUS_LABELS`)

**Interfaces:**
- Produces: `WorkStatus` enum now includes `"done_unverified"` (all downstream tasks depend on this). `Feature["scoreBasis"]["doneUnverified"]: number`. `StatusSnapshot["kpis"]["doneUnverified"]: number`. `ScoreWeights["done_unverified"]: number` (required). `WORK_STATUS_LABELS.done_unverified === "Done, unverified"`.

This task is pure plumbing — it makes the codebase typecheck-ready for every later task, but changes no runtime behavior yet (nothing produces `"done_unverified"` until Task 2).

- [ ] **Step 1: Add the enum member to `WorkStatus`**

In `src/lib/schema.ts`, find:

```ts
export const WorkStatus = z.enum([
  "shipped", "staged", "in_review", "in_progress", "blocked", "todo",
]);
```

Replace with:

```ts
export const WorkStatus = z.enum([
  "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo",
]);
```

- [ ] **Step 2: Add `doneUnverified` to `Feature.scoreBasis` and `StatusSnapshot.kpis`**

In `src/lib/schema.ts`, find the `scoreBasis` field inside the `Feature` object (around line 129):

```ts
  scoreBasis: z.object({
    shipped: z.number(), staged: z.number(), inReview: z.number(),
    inProgress: z.number(), blocked: z.number(), todo: z.number(),
    total: z.number(),
  }),
```

Replace with:

```ts
  scoreBasis: z.object({
    shipped: z.number(), doneUnverified: z.number().default(0), staged: z.number(), inReview: z.number(),
    inProgress: z.number(), blocked: z.number(), todo: z.number(),
    total: z.number(),
  }),
```

Then find the `kpis` field inside `StatusSnapshot` (around line 202):

```ts
  kpis: z.preprocess(renameLegacy("subtasksTracked", "storiesTracked"), z.object({
    featuresTracked: z.number(),
    lightTierMilestones: z.number(),
    /** Stories, not sub-tasks — the scoring unit. Sub-tasks are evidence
     *  and are deliberately not counted here (see Subtask in this file). */
    storiesTracked: z.number(),
    shipped: z.number(),
    staged: z.number(),
    inReview: z.number(),
    blockedOrTodo: z.number(),
  })),
```

Replace with:

```ts
  kpis: z.preprocess(renameLegacy("subtasksTracked", "storiesTracked"), z.object({
    featuresTracked: z.number(),
    lightTierMilestones: z.number(),
    /** Stories, not sub-tasks — the scoring unit. Sub-tasks are evidence
     *  and are deliberately not counted here (see Subtask in this file). */
    storiesTracked: z.number(),
    shipped: z.number(),
    /** JIRA Done, but no PR proves the code reached master — see
     *  src/lib/classify.ts's deriveWorkStatus. Defaulted to 0 so snapshots
     *  written before this field existed still parse. */
    doneUnverified: z.number().default(0),
    staged: z.number(),
    inReview: z.number(),
    blockedOrTodo: z.number(),
  })),
```

- [ ] **Step 3: Add the weight to `ScoreWeights`**

In `src/lib/config-schema.ts`, find:

```ts
export const ScoreWeights = z.object({
  shipped: z.number(),
  staged: z.number(),
  in_review: z.number(),
  in_progress: z.number(),
  blocked: z.number(),
  todo: z.number(),
});
```

Replace with:

```ts
export const ScoreWeights = z.object({
  shipped: z.number(),
  done_unverified: z.number(),
  staged: z.number(),
  in_review: z.number(),
  in_progress: z.number(),
  blocked: z.number(),
  todo: z.number(),
});
```

- [ ] **Step 3b: Add the weight to the config-loading test fixture**

`tests/config.test.ts` loads `tests/fixtures/config.valid.yaml` through the real `ScoreWeights` schema, so it needs the new required field too, or `pnpm test tests/config.test.ts` fails with `scoreWeights.done_unverified: Required`. In `tests/fixtures/config.valid.yaml`, find:

```yaml
scoreWeights:
  shipped: 1.0
  staged: 0.5
  in_review: 0.3
  in_progress: 0.15
  blocked: 0
  todo: 0
```

Replace with:

```yaml
scoreWeights:
  shipped: 1.0
  done_unverified: 1.0
  staged: 0.5
  in_review: 0.3
  in_progress: 0.15
  blocked: 0
  todo: 0
```

- [ ] **Step 4: Add the weight to `config.yaml`**

Find:

```yaml
scoreWeights:
  shipped: 1.0
  staged: 0.5
  in_review: 0.3
  in_progress: 0.15
  blocked: 0
  todo: 0
```

Replace with:

```yaml
scoreWeights:
  shipped: 1.0
  # JIRA Done + product sign-off, but no PR proves the code reached
  # master. Weighted the same as shipped: sign-off counts toward
  # progress, but see the (separately tracked) doneUnverified count and
  # statusLabels.ts for why it's never displayed as plain "shipped".
  done_unverified: 1.0
  staged: 0.5
  in_review: 0.3
  in_progress: 0.15
  blocked: 0
  todo: 0
```

- [ ] **Step 5: Add the display label**

In `src/lib/dashboard/statusLabels.ts`, find:

```ts
export const WORK_STATUS_LABELS: Record<WorkStatusValue, string> = {
  shipped: "Shipped",
  staged: "Staged",
  in_review: "In review",
  in_progress: "In progress",
  blocked: "Blocked",
  todo: "To do",
};
```

Replace with:

```ts
export const WORK_STATUS_LABELS: Record<WorkStatusValue, string> = {
  shipped: "Shipped",
  done_unverified: "Done, unverified",
  staged: "Staged",
  in_review: "In review",
  in_progress: "In progress",
  blocked: "Blocked",
  todo: "To do",
};
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `pnpm build` (or `pnpm exec tsc --noEmit` if faster) followed by `pnpm test`

Expected: the build/typecheck step will surface every place a `Record<WorkStatus, ...>` or similar exhaustive mapping is now missing the new member — do NOT fix those yet, just confirm the compiler errors point only at: `src/lib/score.ts` (`STATUS_TO_BASIS_KEY`), `scripts/collect.ts` (`STATUS_PRIORITY`), and test fixtures constructing `scoreWeights`/`scoreBasis` object literals by hand. If any other file errors, note it — it's a spot this plan missed and needs a step added. `pnpm test` will fail at this point (expected — later tasks fix it); confirm the failures are all `TS`/type errors surfaced by `pnpm build`, not something else.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schema.ts src/lib/config-schema.ts config.yaml src/lib/dashboard/statusLabels.ts
git commit -m "feat: add done_unverified to WorkStatus schema, config, and labels"
```

---

### Task 2: Classification logic — `classify.ts`

**Files:**
- Modify: `src/lib/classify.ts`
- Test: `tests/classify.test.ts`

**Interfaces:**
- Consumes: `WorkStatus` enum from Task 1 (now includes `"done_unverified"`).
- Produces: `deriveWorkStatus(jiraStatus, statusMap, prs, defaultBranch): WorkStatus` now returns `"done_unverified"` for the three previously-mishandled cases.

- [ ] **Step 1: Write the failing tests**

Add to `tests/classify.test.ts`, inside the existing `describe("deriveWorkStatus", ...)` block (after the last existing `it(...)`, before the closing `});` at line 128):

```ts
  it("is 'done_unverified', not 'staged', when JIRA is Done and the only PR merged into a non-master branch", () => {
    const pr = makePr({
      number: 30,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'done_unverified', not 'shipped', when JIRA is Done and the only PR was closed without merging", () => {
    const pr = makePr({ number: 31, state: "CLOSED", baseRefName: "master" });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'done_unverified', not 'shipped', when JIRA is Done and there are no linked PRs at all", () => {
    expect(deriveWorkStatus("Done", statusMap, [], DEFAULT_BRANCH)).toBe("done_unverified");
  });

  it("is 'shipped' when JIRA is Done and a PR actually shipped to the default branch (real proof always wins)", () => {
    const pr = makePr({ number: 32, state: "MERGED", baseRefName: "master", mergedAt: "2026-01-01T00:00:00.000Z" });
    expect(deriveWorkStatus("Done", statusMap, [pr], DEFAULT_BRANCH)).toBe("shipped");
  });

  it("stays 'staged' (not 'done_unverified') when JIRA is NOT Done and a PR merged into a non-master branch", () => {
    const pr = makePr({
      number: 33,
      state: "MERGED",
      baseRefName: "integration/wpp",
      mergedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deriveWorkStatus("In Progress", statusMap, [pr], DEFAULT_BRANCH)).toBe("staged");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/classify.test.ts`
Expected: the four new `done_unverified` assertions FAIL (current code returns `"staged"` or `"shipped"` instead) — the fifth (`stays 'staged'`) passes already.

- [ ] **Step 3: Update `deriveWorkStatus`**

In `src/lib/classify.ts`, find:

```ts
/** Derives a story's GitHub-aware status. Starts from the JIRA status
 *  mapped through config's statusMap (default "todo" + a warning for
 *  unmapped names — the map should have an entry for every status the
 *  configured JIRA project actually uses), then upgrades to "shipped" or
 *  "staged" if any linked PR proves it, since a stale JIRA status must
 *  never outrank real GitHub activity. */
export function deriveWorkStatus(
  jiraStatus: string,
  statusMap: Record<string, WorkStatus>,
  prs: RawPr[],
  defaultBranch: string,
): WorkStatus {
  let base = statusMap[jiraStatus];
  if (base === undefined) {
    console.warn(`deriveWorkStatus: unmapped JIRA status "${jiraStatus}", defaulting to "todo"`);
    base = "todo";
  }

  if (prs.some((pr) => classifyPr(pr, defaultBranch).shippedToDefault)) {
    return "shipped";
  }
  if (prs.some((pr) => pr.state === "MERGED")) {
    return "staged";
  }
  if (prs.some((pr) => pr.state === "OPEN")) {
    return "in_review";
  }
  return base;
}
```

Replace with:

```ts
/** Derives a story's GitHub-aware status. Starts from the JIRA status
 *  mapped through config's statusMap (default "todo" + a warning for
 *  unmapped names — the map should have an entry for every status the
 *  configured JIRA project actually uses), then upgrades to "shipped",
 *  "done_unverified", or "staged" if the linked PRs prove it, since a
 *  stale JIRA status must never outrank real GitHub activity — in either
 *  direction. A base of "shipped" (i.e. JIRA already says Done) is never
 *  returned as-is: it's either confirmed by a PR that actually shipped to
 *  the default branch, or downgraded to "done_unverified", which covers
 *  every remaining case GitHub can't confirm — merged into a non-master
 *  branch, closed without merging, or no linked PR at all. */
export function deriveWorkStatus(
  jiraStatus: string,
  statusMap: Record<string, WorkStatus>,
  prs: RawPr[],
  defaultBranch: string,
): WorkStatus {
  let base = statusMap[jiraStatus];
  if (base === undefined) {
    console.warn(`deriveWorkStatus: unmapped JIRA status "${jiraStatus}", defaulting to "todo"`);
    base = "todo";
  }

  if (prs.some((pr) => classifyPr(pr, defaultBranch).shippedToDefault)) {
    return "shipped";
  }
  if (base === "shipped") {
    return "done_unverified";
  }
  if (prs.some((pr) => pr.state === "MERGED")) {
    return "staged";
  }
  if (prs.some((pr) => pr.state === "OPEN")) {
    return "in_review";
  }
  return base;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/classify.test.ts`
Expected: PASS — all tests in the file, including the five new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classify.ts tests/classify.test.ts
git commit -m "feat: classify JIRA-Done-but-GitHub-unconfirmed stories as done_unverified"
```

---

### Task 3: Scoring — `score.ts`

**Files:**
- Modify: `src/lib/score.ts`
- Test: `tests/score.test.ts`

**Interfaces:**
- Consumes: `WorkStatus` (Task 1), `deriveWorkStatus` now producing `"done_unverified"` (Task 2).
- Produces: `ScoreBasis["doneUnverified"]: number`. `computeScore` weights `"done_unverified"` using `weights.done_unverified` and increments `scoreBasis.doneUnverified`, never `scoreBasis.shipped`.

- [ ] **Step 1: Write the failing tests**

In `tests/score.test.ts`, update `DEFAULT_WEIGHTS` (it's a `Record<WorkStatus, number>`-shaped literal, so it must carry every key `computeScore` will read) — find:

```ts
const DEFAULT_WEIGHTS = {
  shipped: 1.0,
  staged: 0.5,
  in_review: 0.3,
  in_progress: 0.15,
  blocked: 0,
  todo: 0,
};
```

Replace with:

```ts
const DEFAULT_WEIGHTS = {
  shipped: 1.0,
  done_unverified: 1.0,
  staged: 0.5,
  in_review: 0.3,
  in_progress: 0.15,
  blocked: 0,
  todo: 0,
};
```

Update the existing `"produces a scoreBasis with raw counts per status..."` test — find:

```ts
  it("produces a scoreBasis with raw counts per status, not weighted values", () => {
    const result = computeScore(
      ["shipped", "shipped", "staged", "in_review", "in_progress", "blocked", "todo"],
      DEFAULT_WEIGHTS,
    );
    expect(result.scoreBasis).toEqual({
      shipped: 2,
      staged: 1,
      inReview: 1,
      inProgress: 1,
      blocked: 1,
      todo: 1,
      total: 7,
    });
  });
```

Replace with:

```ts
  it("produces a scoreBasis with raw counts per status, not weighted values", () => {
    const result = computeScore(
      ["shipped", "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo"],
      DEFAULT_WEIGHTS,
    );
    expect(result.scoreBasis).toEqual({
      shipped: 2,
      doneUnverified: 1,
      staged: 1,
      inReview: 1,
      inProgress: 1,
      blocked: 1,
      todo: 1,
      total: 8,
    });
  });

  it("weights done_unverified the same as shipped, and never folds its count into scoreBasis.shipped", () => {
    const result = computeScore(["done_unverified", "done_unverified"], DEFAULT_WEIGHTS);
    expect(result.score).toBe(100);
    expect(result.scoreBasis.shipped).toBe(0);
    expect(result.scoreBasis.doneUnverified).toBe(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/score.test.ts`
Expected: FAIL — `computeScore` doesn't yet know about `"done_unverified"` (TS will actually fail to compile `STATUS_TO_BASIS_KEY[status]` as a runtime `undefined` lookup, or the test assertions on `scoreBasis.doneUnverified` fail since the key doesn't exist yet).

- [ ] **Step 3: Update `score.ts`**

In `src/lib/score.ts`, find:

```ts
export type ScoreBasis = {
  shipped: number;
  staged: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  todo: number;
  total: number;
};

const STATUS_TO_BASIS_KEY: Record<WorkStatus, keyof Omit<ScoreBasis, "total">> = {
  shipped: "shipped",
  staged: "staged",
  in_review: "inReview",
  in_progress: "inProgress",
  blocked: "blocked",
  todo: "todo",
};
```

Replace with:

```ts
export type ScoreBasis = {
  shipped: number;
  doneUnverified: number;
  staged: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  todo: number;
  total: number;
};

const STATUS_TO_BASIS_KEY: Record<WorkStatus, keyof Omit<ScoreBasis, "total">> = {
  shipped: "shipped",
  done_unverified: "doneUnverified",
  staged: "staged",
  in_review: "inReview",
  in_progress: "inProgress",
  blocked: "blocked",
  todo: "todo",
};
```

Then find, inside `computeScore`:

```ts
  const scoreBasis: ScoreBasis = {
    shipped: 0,
    staged: 0,
    inReview: 0,
    inProgress: 0,
    blocked: 0,
    todo: 0,
    total: storyStatuses.length,
  };
```

Replace with:

```ts
  const scoreBasis: ScoreBasis = {
    shipped: 0,
    doneUnverified: 0,
    staged: 0,
    inReview: 0,
    inProgress: 0,
    blocked: 0,
    todo: 0,
    total: storyStatuses.length,
  };
```

(No other change needed in `computeScore` — the weighted-mean loop and the `scoreBasis[STATUS_TO_BASIS_KEY[status]] += 1` loop are already generic over every `WorkStatus`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/score.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/score.ts tests/score.test.ts
git commit -m "feat: score done_unverified at the shipped weight, tracked in its own basis count"
```

---

### Task 4: Pipeline wiring — `collect.ts`, `merge.ts`, `nav.ts`

**Files:**
- Modify: `scripts/collect.ts` (`STATUS_PRIORITY`, `rollUpStoryStatus`)
- Modify: `scripts/merge.ts` (`kpis` aggregation)
- Modify: `src/lib/dashboard/nav.ts` (`milestoneProgress`, `epicProgress`)
- Modify: `tests/collect.test.ts`, `tests/merge.test.ts` (fixtures that hand-construct `scoreBasis`/`scoreWeights` literals)

**Interfaces:**
- Consumes: `ScoreBasis["doneUnverified"]` (Task 3), `WorkStatus` (Task 1).
- Produces: `StatusSnapshot["kpis"]["doneUnverified"]` correctly populated by `merge.ts`. `MilestoneProgress["doneUnverified"]: number` from `nav.ts`. `EpicProgress["doneUnverifiedShare"]: number` from `nav.ts`.

- [ ] **Step 1: Add `done_unverified` to `STATUS_PRIORITY` and widen `rollUpStoryStatus`'s "in flight" check**

In `scripts/collect.ts`, find:

```ts
const STATUS_PRIORITY: Record<WorkStatus, number> = {
  shipped: 5,
  staged: 4,
  in_review: 3,
  in_progress: 2,
  blocked: 1,
  todo: 0,
};
```

Replace with:

```ts
const STATUS_PRIORITY: Record<WorkStatus, number> = {
  shipped: 6,
  done_unverified: 5,
  staged: 4,
  in_review: 3,
  in_progress: 2,
  blocked: 1,
  todo: 0,
};
```

Then find, in `rollUpStoryStatus`:

```ts
  if (subtasks.every((s) => s.status === "shipped")) return atLeast("shipped");
  if (subtasks.some((s) => s.status === "shipped" || s.status === "staged" || s.status === "in_review")) {
    return atLeast("in_review");
  }
  return ownStatus;
```

Replace with:

```ts
  if (subtasks.every((s) => s.status === "shipped")) return atLeast("shipped");
  if (
    subtasks.some(
      (s) => s.status === "shipped" || s.status === "done_unverified" || s.status === "staged" || s.status === "in_review",
    )
  ) {
    return atLeast("in_review");
  }
  return ownStatus;
```

(A `done_unverified` sub-task is real evidence of work — same "at least in_review" treatment as a `staged` one. It deliberately does NOT join the `every(...) === "shipped"` check on the line above: rolling a story up to "shipped" must still require literal, GitHub-verified sub-tasks.)

- [ ] **Step 2: Add `doneUnverified` to `merge.ts`'s kpis aggregation**

In `scripts/merge.ts`, find:

```ts
    kpis: {
      featuresTracked: totalFeatures,
      lightTierMilestones: new Set(features.filter((f) => f.tier === "light").map((f) => f.milestone)).size,
      storiesTracked: features.reduce((sum, f) => sum + f.scoreBasis.total, 0),
      shipped: features.reduce((sum, f) => sum + f.scoreBasis.shipped, 0),
      staged: features.reduce((sum, f) => sum + f.scoreBasis.staged, 0),
      inReview: features.reduce((sum, f) => sum + f.scoreBasis.inReview, 0),
      blockedOrTodo: features.reduce((sum, f) => sum + f.scoreBasis.blocked + f.scoreBasis.todo, 0),
    },
```

Replace with:

```ts
    kpis: {
      featuresTracked: totalFeatures,
      lightTierMilestones: new Set(features.filter((f) => f.tier === "light").map((f) => f.milestone)).size,
      storiesTracked: features.reduce((sum, f) => sum + f.scoreBasis.total, 0),
      shipped: features.reduce((sum, f) => sum + f.scoreBasis.shipped, 0),
      doneUnverified: features.reduce((sum, f) => sum + f.scoreBasis.doneUnverified, 0),
      staged: features.reduce((sum, f) => sum + f.scoreBasis.staged, 0),
      inReview: features.reduce((sum, f) => sum + f.scoreBasis.inReview, 0),
      blockedOrTodo: features.reduce((sum, f) => sum + f.scoreBasis.blocked + f.scoreBasis.todo, 0),
    },
```

- [ ] **Step 3: Update `nav.ts`'s `milestoneProgress` and `epicProgress`**

In `src/lib/dashboard/nav.ts`, find:

```ts
export type MilestoneProgress = {
  score: number;
  stage: StageT;
  shipped: number;
  staged: number;
  inReview: number;
  blockedOrTodo: number;
  storiesTracked: number;
};
```

Replace with:

```ts
export type MilestoneProgress = {
  score: number;
  stage: StageT;
  shipped: number;
  doneUnverified: number;
  staged: number;
  inReview: number;
  blockedOrTodo: number;
  storiesTracked: number;
};
```

Find:

```ts
export function milestoneProgress(features: FeatureT[]): MilestoneProgress {
  const totals = features.reduce(
    (acc, f) => ({
      shipped: acc.shipped + f.scoreBasis.shipped,
      staged: acc.staged + f.scoreBasis.staged,
      inReview: acc.inReview + f.scoreBasis.inReview,
      inProgress: acc.inProgress + f.scoreBasis.inProgress,
      blocked: acc.blocked + f.scoreBasis.blocked,
      todo: acc.todo + f.scoreBasis.todo,
      total: acc.total + f.scoreBasis.total,
    }),
    { shipped: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 0 },
  );

  const weights = loadAppConfig().scoreWeights;
  const weighted =
    totals.shipped * weights.shipped +
    totals.staged * weights.staged +
    totals.inReview * weights.in_review +
    totals.inProgress * weights.in_progress +
    totals.blocked * weights.blocked +
    totals.todo * weights.todo;
  const score = totals.total === 0 ? 0 : Math.max(0, Math.min(100, Math.round((weighted / totals.total) * 100)));
  const allDone = features.length > 0 && features.every((f) => f.stage === "done");

  return {
    score,
    stage: deriveStage(score, allDone),
    shipped: totals.shipped,
    staged: totals.staged,
    inReview: totals.inReview,
    blockedOrTodo: totals.blocked + totals.todo,
    storiesTracked: totals.total,
  };
}
```

Replace with:

```ts
export function milestoneProgress(features: FeatureT[]): MilestoneProgress {
  const totals = features.reduce(
    (acc, f) => ({
      shipped: acc.shipped + f.scoreBasis.shipped,
      doneUnverified: acc.doneUnverified + f.scoreBasis.doneUnverified,
      staged: acc.staged + f.scoreBasis.staged,
      inReview: acc.inReview + f.scoreBasis.inReview,
      inProgress: acc.inProgress + f.scoreBasis.inProgress,
      blocked: acc.blocked + f.scoreBasis.blocked,
      todo: acc.todo + f.scoreBasis.todo,
      total: acc.total + f.scoreBasis.total,
    }),
    { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 0 },
  );

  const weights = loadAppConfig().scoreWeights;
  const weighted =
    totals.shipped * weights.shipped +
    totals.doneUnverified * weights.done_unverified +
    totals.staged * weights.staged +
    totals.inReview * weights.in_review +
    totals.inProgress * weights.in_progress +
    totals.blocked * weights.blocked +
    totals.todo * weights.todo;
  const score = totals.total === 0 ? 0 : Math.max(0, Math.min(100, Math.round((weighted / totals.total) * 100)));
  const allDone = features.length > 0 && features.every((f) => f.stage === "done");

  return {
    score,
    stage: deriveStage(score, allDone),
    shipped: totals.shipped,
    doneUnverified: totals.doneUnverified,
    staged: totals.staged,
    inReview: totals.inReview,
    blockedOrTodo: totals.blocked + totals.todo,
    storiesTracked: totals.total,
  };
}
```

Find:

```ts
export type EpicProgress = {
  /** weighted completion across every tracked story, 0-100 */
  percent: number;
  /** share of all tracked stories, for the segmented bar */
  shippedShare: number;
  stagedShare: number;
  inReviewShare: number;
};

/** Epic-level completion, derived from the published KPI counts using the
 *  same weights as a single feature's score (src/lib/score.ts): shipped
 *  counts full, staged half, in review a third. Deliberately *not* the
 *  mean of feature scores — that would weight a one-story feature the
 *  same as a fourteen-story one. */
export function epicProgress(kpis: StatusSnapshotT["kpis"]): EpicProgress {
  const total = kpis.storiesTracked;
  if (total === 0) {
    return { percent: 0, shippedShare: 0, stagedShare: 0, inReviewShare: 0 };
  }
  const weighted = kpis.shipped * 1 + kpis.staged * 0.5 + kpis.inReview * 0.3;
  return {
    percent: Math.round((weighted / total) * 100),
    shippedShare: (kpis.shipped / total) * 100,
    stagedShare: (kpis.staged / total) * 100,
    inReviewShare: (kpis.inReview / total) * 100,
  };
}
```

Replace with:

```ts
export type EpicProgress = {
  /** weighted completion across every tracked story, 0-100 */
  percent: number;
  /** share of all tracked stories, for the segmented bar */
  shippedShare: number;
  doneUnverifiedShare: number;
  stagedShare: number;
  inReviewShare: number;
};

/** Epic-level completion, derived from the published KPI counts using the
 *  same weights as a single feature's score (src/lib/score.ts): shipped
 *  and done_unverified both count full, staged half, in review a third.
 *  Deliberately *not* the mean of feature scores — that would weight a
 *  one-story feature the same as a fourteen-story one. */
export function epicProgress(kpis: StatusSnapshotT["kpis"]): EpicProgress {
  const total = kpis.storiesTracked;
  if (total === 0) {
    return { percent: 0, shippedShare: 0, doneUnverifiedShare: 0, stagedShare: 0, inReviewShare: 0 };
  }
  const weighted = kpis.shipped * 1 + kpis.doneUnverified * 1 + kpis.staged * 0.5 + kpis.inReview * 0.3;
  return {
    percent: Math.round((weighted / total) * 100),
    shippedShare: (kpis.shipped / total) * 100,
    doneUnverifiedShare: (kpis.doneUnverified / total) * 100,
    stagedShare: (kpis.staged / total) * 100,
    inReviewShare: (kpis.inReview / total) * 100,
  };
}
```

- [ ] **Step 4: Fix hand-constructed test fixtures**

In `tests/merge.test.ts`, find (inside `makeRawFeature`):

```ts
    scoreBasis: { shipped: 3, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 4 },
```

Replace with:

```ts
    scoreBasis: { shipped: 3, doneUnverified: 0, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 4 },
```

And find (inside `runMerge`'s `config`):

```ts
    scoreWeights: { shipped: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
```

Replace with:

```ts
    scoreWeights: { shipped: 1, done_unverified: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
```

- [ ] **Step 4b: Fix three more hand-constructed fixture literals discovered during implementation**

Beyond `tests/merge.test.ts`, three more files hand-construct `scoreBasis`/`scoreWeights` object literals that now need the new field to keep `pnpm build`/`tsc --noEmit` type-checking clean (these don't fail `pnpm test`, since Vitest doesn't type-check, but they will fail Task 14's `pnpm build` gate):

In `tests/collect.test.ts`, find:

```ts
  scoreWeights: { shipped: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
```

Replace with:

```ts
  scoreWeights: { shipped: 1, done_unverified: 1, staged: 0.5, in_review: 0.3, in_progress: 0.15, blocked: 0, todo: 0 },
```

In `tests/collect-pending-body.test.ts`, find:

```ts
    scoreBasis: { shipped: 1, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 1 },
```

Replace with:

```ts
    scoreBasis: { shipped: 1, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 1 },
```

In `tests/dashboard/search.test.ts`, there are three occurrences — find each and add `doneUnverified: 0,` right after `shipped: N,` in each:

```ts
    scoreBasis: { shipped: 1, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 2 },
```
→
```ts
    scoreBasis: { shipped: 1, doneUnverified: 0, staged: 1, inReview: 0, inProgress: 0, blocked: 0, todo: 0, total: 2 },
```

and (this exact literal appears twice, at lines 65 and 161 — replace both occurrences):

```ts
scoreBasis: { shipped: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 }
```
→
```ts
scoreBasis: { shipped: 0, doneUnverified: 0, staged: 0, inReview: 0, inProgress: 0, blocked: 1, todo: 0, total: 1 }
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — `tests/collect.test.ts`, `tests/merge.test.ts`, and every other suite touched so far. `rollUpStoryStatus`'s existing tests (`tests/collect.test.ts:340-364`) still pass unchanged since none of them use `"done_unverified"` — this step only confirms the widened condition didn't regress the `staged`/`in_review` cases already covered.

- [ ] **Step 6: Commit**

```bash
git add scripts/collect.ts scripts/merge.ts src/lib/dashboard/nav.ts tests/collect.test.ts tests/merge.test.ts
git commit -m "feat: wire done_unverified through collect/merge pipeline and nav progress math"
```

---

### Task 5: CSS design tokens — `styles.css`

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: nothing (pure CSS).
- Produces: `--status-done-unverified` (light + dark), `--color-status-done-unverified`, and `[data-status]`/`[data-status-dot]`/`[data-status-icon]` rules for `"done_unverified"` — consumed by `StatusPill`/`JiraLink` (no code changes needed there, per Task 1's generic `tone: string` / `data-status={status}` wiring) starting the moment this task lands.

- [ ] **Step 1: Add the seventh hue and update the "six-hue" doc comments**

In `src/styles.css`, find (inside `:root`):

```css
  /* Status family — six hues, matched lightness/chroma so they sit
     together. Distinct hues (not distinct saturation) so shipped vs.
     staged is unambiguous at a glance and under common colour-vision
     deficiencies. --destructive reuses --status-blocked deliberately,
     rather than inventing a seventh hue. --status-shipped deliberately
     reuses --primary rather than a stock green: "shipped" is this
     product's actual finish line, so it gets the brand's own olive
     instead of a generic traffic-light colour — every bar, dot, and
     pill that reads "done" is drawn in the same hue as the logo. */
  --status-shipped: var(--primary);
  --status-staged: #9a7b4f;
  --status-in-review: #5f6b7a;
  --status-in-progress: #b5654a;
  --status-blocked: #d32f2f;
  --status-todo: #a9a89f;
  --destructive: var(--status-blocked);
```

Replace with:

```css
  /* Status family — seven hues, matched lightness/chroma so they sit
     together. Distinct hues (not distinct saturation) so shipped vs.
     staged vs. done-unverified is unambiguous at a glance and under
     common colour-vision deficiencies. --destructive reuses
     --status-blocked deliberately, rather than inventing an eighth hue.
     --status-shipped deliberately reuses --primary rather than a stock
     green: "shipped" is this product's actual finish line, so it gets
     the brand's own olive instead of a generic traffic-light colour —
     every bar, dot, and pill that reads "done" is drawn in the same hue
     as the logo. --status-done-unverified sits deliberately between
     --status-shipped and --status-staged in hue: it's real progress
     (sign-off happened) but not the finish line (GitHub can't confirm
     it), and must never be mistaken for either at a glance. */
  --status-shipped: var(--primary);
  --status-done-unverified: #b08d3f;
  --status-staged: #9a7b4f;
  --status-in-review: #5f6b7a;
  --status-in-progress: #b5654a;
  --status-blocked: #d32f2f;
  --status-todo: #a9a89f;
  --destructive: var(--status-blocked);
```

Find (inside `.dark`):

```css
  --status-shipped: var(--primary);
  --status-staged: #c7a472;
  --status-in-review: #93a3b5;
  --status-in-progress: #de9078;
  --status-blocked: #eb6f6b;
  --status-todo: #7c7a72;
  --destructive: var(--status-blocked);
  --pr-shipped: #b98fe0;
```

Replace with:

```css
  --status-shipped: var(--primary);
  --status-done-unverified: #d9b563;
  --status-staged: #c7a472;
  --status-in-review: #93a3b5;
  --status-in-progress: #de9078;
  --status-blocked: #eb6f6b;
  --status-todo: #7c7a72;
  --destructive: var(--status-blocked);
  --pr-shipped: #b98fe0;
```

- [ ] **Step 2: Add the `@theme inline` alias**

Find:

```css
  --color-status-shipped: var(--status-shipped);
  --color-status-staged: var(--status-staged);
```

Replace with:

```css
  --color-status-shipped: var(--status-shipped);
  --color-status-done-unverified: var(--status-done-unverified);
  --color-status-staged: var(--status-staged);
```

- [ ] **Step 3: Add the `[data-status]` pill rule**

Find:

```css
[data-status="shipped"] {
  --status-color: var(--status-shipped);
}
[data-status="staged"] {
  --status-color: var(--status-staged);
}
```

Replace with:

```css
[data-status="shipped"] {
  --status-color: var(--status-shipped);
}
[data-status="done_unverified"] {
  --status-color: var(--status-done-unverified);
}
[data-status="staged"] {
  --status-color: var(--status-staged);
}
```

- [ ] **Step 4: Add the `[data-status-dot]`/`[data-status-icon]` rules**

Find:

```css
[data-status-dot="shipped"],
[data-status-dot="done"],
[data-status-icon="shipped"],
[data-status-icon="done"] {
  --status-color: var(--status-shipped);
}
[data-status-dot="staged"],
[data-status-dot="nearly_done"],
[data-status-icon="staged"],
[data-status-icon="nearly_done"] {
  --status-color: var(--status-staged);
}
```

Replace with:

```css
[data-status-dot="shipped"],
[data-status-dot="done"],
[data-status-icon="shipped"],
[data-status-icon="done"] {
  --status-color: var(--status-shipped);
}
[data-status-dot="done_unverified"],
[data-status-icon="done_unverified"] {
  --status-color: var(--status-done-unverified);
}
[data-status-dot="staged"],
[data-status-dot="nearly_done"],
[data-status-icon="staged"],
[data-status-icon="nearly_done"] {
  --status-color: var(--status-staged);
}
```

- [ ] **Step 5: Verify in the browser**

Run: `pnpm dev` (via the project's dev server), open any page with a Story showing `staged` (e.g. a feature page), and use dev tools to confirm `--status-done-unverified` resolves to a distinct amber tone in both light and dark mode. No `done_unverified` data exists yet (Task 2 is deployed but nothing downstream renders it specially until later tasks) — this step is a visual sanity check of the raw token only, e.g. by temporarily setting `data-status="done_unverified"` on an element in dev tools.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "feat: add the done-unverified status colour token"
```

---

### Task 6: `EpicHeader.tsx` segmented bar

**Files:**
- Modify: `src/components/dashboard/shell/EpicHeader.tsx`

**Interfaces:**
- Consumes: `epicProgress()` from Task 4, now returning `doneUnverifiedShare`. `snapshot.kpis.doneUnverified` from Task 4.

- [ ] **Step 1: Add the segment and the count line**

Find:

```ts
const SEGMENTS = [
  { key: "shippedShare", color: "var(--status-shipped)", label: WORK_STATUS_LABELS.shipped },
  { key: "stagedShare", color: "var(--status-staged)", label: WORK_STATUS_LABELS.staged },
  { key: "inReviewShare", color: "var(--status-in-review)", label: WORK_STATUS_LABELS.in_review },
] as const
```

Replace with:

```ts
const SEGMENTS = [
  { key: "shippedShare", color: "var(--status-shipped)", label: WORK_STATUS_LABELS.shipped },
  { key: "doneUnverifiedShare", color: "var(--status-done-unverified)", label: WORK_STATUS_LABELS.done_unverified },
  { key: "stagedShare", color: "var(--status-staged)", label: WORK_STATUS_LABELS.staged },
  { key: "inReviewShare", color: "var(--status-in-review)", label: WORK_STATUS_LABELS.in_review },
] as const
```

Find:

```tsx
            <div className="flex h-4 flex-wrap items-center gap-x-3.5 text-[11.5px] leading-4 text-muted-foreground">
              <span>
                <span className="font-mono-data">{snapshot.kpis.shipped}</span> shipped
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.staged}</span> staged
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.inReview}</span> in review
              </span>
            </div>
```

Replace with:

```tsx
            <div className="flex h-4 flex-wrap items-center gap-x-3.5 text-[11.5px] leading-4 text-muted-foreground">
              <span>
                <span className="font-mono-data">{snapshot.kpis.shipped}</span> shipped
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.doneUnverified}</span> done, unverified
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.staged}</span> staged
              </span>
              <span>
                <span className="font-mono-data">{snapshot.kpis.inReview}</span> in review
              </span>
            </div>
```

- [ ] **Step 2: Verify in the browser**

Run the dev server, load the Today page, and confirm the header's segmented bar and count line render without error (with `doneUnverified: 0` in current real data, the new segment and count will show `0` / no visible width — that's correct until Task 2's logic actually produces `done_unverified` stories from real collected data).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/shell/EpicHeader.tsx
git commit -m "feat: show done_unverified as its own segment in the epic header"
```

---

### Task 7: `StoryStatusMixChart.tsx`

**Files:**
- Modify: `src/components/dashboard/StoryStatusMixChart.tsx`

**Interfaces:**
- Consumes: `Feature["scoreBasis"]["doneUnverified"]` (Task 1/3), `WORK_STATUS_LABELS.done_unverified` (Task 1).

- [ ] **Step 1: Add the series**

Find:

```ts
const chartConfig = {
  shipped: { label: WORK_STATUS_LABELS.shipped, color: "var(--status-shipped)" },
  staged: { label: WORK_STATUS_LABELS.staged, color: "var(--status-staged)" },
  inReview: { label: WORK_STATUS_LABELS.in_review, color: "var(--status-in-review)" },
  inProgress: { label: WORK_STATUS_LABELS.in_progress, color: "var(--status-in-progress)" },
  blocked: { label: WORK_STATUS_LABELS.blocked, color: "var(--status-blocked)" },
  todo: { label: WORK_STATUS_LABELS.todo, color: "var(--status-todo)" },
} satisfies ChartConfig
```

Replace with:

```ts
const chartConfig = {
  shipped: { label: WORK_STATUS_LABELS.shipped, color: "var(--status-shipped)" },
  doneUnverified: { label: WORK_STATUS_LABELS.done_unverified, color: "var(--status-done-unverified)" },
  staged: { label: WORK_STATUS_LABELS.staged, color: "var(--status-staged)" },
  inReview: { label: WORK_STATUS_LABELS.in_review, color: "var(--status-in-review)" },
  inProgress: { label: WORK_STATUS_LABELS.in_progress, color: "var(--status-in-progress)" },
  blocked: { label: WORK_STATUS_LABELS.blocked, color: "var(--status-blocked)" },
  todo: { label: WORK_STATUS_LABELS.todo, color: "var(--status-todo)" },
} satisfies ChartConfig
```

(No other change needed — per the file's own comment, `data = features.map((f) => ({ code: f.code, ...f.scoreBasis }))` and the `SERIES.map(...)` bar-rendering loop are already generic over every key in `chartConfig`.)

- [ ] **Step 2: Verify in the browser**

Load the Today page, confirm the "Story status mix" chart renders with no console errors and the legend now lists "Done, unverified".

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/StoryStatusMixChart.tsx
git commit -m "feat: add done_unverified series to the story status mix chart"
```

---

### Task 8: Burn-up — `burnup.ts` + `BurnUpChart.tsx`

**Files:**
- Modify: `src/lib/dashboard/burnup.ts`
- Modify: `src/components/dashboard/BurnUpChart.tsx`
- Test: `tests/dashboard/burnup.test.ts`

**Interfaces:**
- Consumes: `HistoryPoint["kpis"]["doneUnverified"]` (Task 1/4).
- Produces: `BurnUpPoint["doneUnverified"]: number`.

- [ ] **Step 1: Update the failing test fixtures and expectations**

In `tests/dashboard/burnup.test.ts`, find:

```ts
const history: HistoryPoint[] = [
  {
    date: "2026-08-10",
    generatedAt: "2026-08-10T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 0, staged: 1, inReview: 0, blockedOrTodo: 2 },
  },
  {
    date: "2026-08-11",
    generatedAt: "2026-08-11T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 1, staged: 0, inReview: 0, blockedOrTodo: 2 },
  },
];
```

Replace with:

```ts
const history: HistoryPoint[] = [
  {
    date: "2026-08-10",
    generatedAt: "2026-08-10T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 0, doneUnverified: 0, staged: 1, inReview: 0, blockedOrTodo: 2 },
  },
  {
    date: "2026-08-11",
    generatedAt: "2026-08-11T08:00:00.000Z",
    kpis: { featuresTracked: 2, lightTierMilestones: 0, storiesTracked: 3, shipped: 1, doneUnverified: 0, staged: 0, inReview: 0, blockedOrTodo: 2 },
  },
];
```

Find:

```ts
  it("carries shipped/staged/total from each point's kpis", () => {
    const series = buildBurnUpSeries(history, "2026-08-01", null);
    expect(series).toEqual([
      { date: "2026-08-10", shipped: 0, staged: 1, total: 3, pace: null },
      { date: "2026-08-11", shipped: 1, staged: 0, total: 3, pace: null },
    ]);
  });
```

Replace with:

```ts
  it("carries shipped/doneUnverified/staged/total from each point's kpis", () => {
    const series = buildBurnUpSeries(history, "2026-08-01", null);
    expect(series).toEqual([
      { date: "2026-08-10", shipped: 0, doneUnverified: 0, staged: 1, total: 3, pace: null },
      { date: "2026-08-11", shipped: 1, doneUnverified: 0, staged: 0, total: 3, pace: null },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/dashboard/burnup.test.ts`
Expected: FAIL — `buildBurnUpSeries` doesn't populate `doneUnverified` yet.

- [ ] **Step 3: Update `burnup.ts`**

Find:

```ts
export type BurnUpPoint = {
  date: string;
  shipped: number;
  staged: number;
  total: number;
  /** Straight-line count of stories that "should" be shipped by this
   *  date to be on pace for `targetDate` — null when there's no target
   *  date configured. Never an estimate; it's a fixed line from
   *  (startDate, 0) to (targetDate, finalTotal). */
  pace: number | null;
};
```

Replace with:

```ts
export type BurnUpPoint = {
  date: string;
  shipped: number;
  doneUnverified: number;
  staged: number;
  total: number;
  /** Straight-line count of stories that "should" be shipped by this
   *  date to be on pace for `targetDate` — null when there's no target
   *  date configured. Never an estimate; it's a fixed line from
   *  (startDate, 0) to (targetDate, finalTotal). */
  pace: number | null;
};
```

Find:

```ts
    return {
      date: point.date,
      shipped: point.kpis.shipped,
      staged: point.kpis.staged,
      total: point.kpis.storiesTracked,
      pace,
    };
```

Replace with:

```ts
    return {
      date: point.date,
      shipped: point.kpis.shipped,
      doneUnverified: point.kpis.doneUnverified,
      staged: point.kpis.staged,
      total: point.kpis.storiesTracked,
      pace,
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/dashboard/burnup.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the chart area**

In `src/components/dashboard/BurnUpChart.tsx`, find:

```ts
const chartConfig = {
  shipped: { label: "Shipped", color: "var(--status-shipped)" },
  staged: { label: "Staged", color: "var(--status-staged)" },
  total: { label: "Total tracked", color: "var(--foreground)" },
  pace: { label: "Pace needed for target", color: "var(--muted-foreground)" },
} satisfies ChartConfig
```

Replace with:

```ts
const chartConfig = {
  shipped: { label: "Shipped", color: "var(--status-shipped)" },
  doneUnverified: { label: "Done, unverified", color: "var(--status-done-unverified)" },
  staged: { label: "Staged", color: "var(--status-staged)" },
  total: { label: "Total tracked", color: "var(--foreground)" },
  pace: { label: "Pace needed for target", color: "var(--muted-foreground)" },
} satisfies ChartConfig
```

Find:

```tsx
                <Area
                  type="monotone"
                  dataKey="shipped"
                  stackId="burnup"
                  stroke="var(--color-shipped)"
                  fill="var(--color-shipped)"
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="staged"
                  stackId="burnup"
                  stroke="var(--color-staged)"
                  fill="var(--color-staged)"
                  fillOpacity={0.45}
                />
```

Replace with:

```tsx
                <Area
                  type="monotone"
                  dataKey="shipped"
                  stackId="burnup"
                  stroke="var(--color-shipped)"
                  fill="var(--color-shipped)"
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="doneUnverified"
                  stackId="burnup"
                  stroke="var(--color-doneUnverified)"
                  fill="var(--color-doneUnverified)"
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="staged"
                  stackId="burnup"
                  stroke="var(--color-staged)"
                  fill="var(--color-staged)"
                  fillOpacity={0.45}
                />
```

- [ ] **Step 6: Verify in the browser**

Load the Today page, confirm the burn-up chart renders the new stacked area and legend entry with no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/burnup.ts src/components/dashboard/BurnUpChart.tsx tests/dashboard/burnup.test.ts
git commit -m "feat: track done_unverified as its own burn-up series"
```

---

### Task 9: `FeaturePage.tsx`

**Files:**
- Modify: `src/components/dashboard/pages/FeaturePage.tsx`

**Interfaces:**
- Consumes: `Story["status"]` now including `"done_unverified"` (Task 1/2). `Feature["scoreBasis"]["doneUnverified"]` (Task 1/3).

- [ ] **Step 1: Add the filter tab**

Find:

```ts
type StoryFilter = "all" | "in_review" | "staged" | "no_pr"

const FILTERS: { id: StoryFilter; label: string; match: (s: StoryT) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "in_review", label: "Needs review", match: (s) => s.status === "in_review" },
  { id: "staged", label: "Staged", match: (s) => s.status === "staged" },
  { id: "no_pr", label: "No PR", match: (s) => s.prs.length === 0 },
]
```

Replace with:

```ts
type StoryFilter = "all" | "in_review" | "done_unverified" | "staged" | "no_pr"

const FILTERS: { id: StoryFilter; label: string; match: (s: StoryT) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "in_review", label: "Needs review", match: (s) => s.status === "in_review" },
  { id: "done_unverified", label: "Done, unverified", match: (s) => s.status === "done_unverified" },
  { id: "staged", label: "Staged", match: (s) => s.status === "staged" },
  { id: "no_pr", label: "No PR", match: (s) => s.prs.length === 0 },
]
```

- [ ] **Step 2: Add it to the status-mix summary line**

Find, inside `StatusMixLine`:

```ts
  const parts = (
    [
      ["shipped", feature.scoreBasis.shipped],
      ["staged", feature.scoreBasis.staged],
      ["in_review", feature.scoreBasis.inReview],
      ["in_progress", feature.scoreBasis.inProgress],
      ["blocked", feature.scoreBasis.blocked],
      ["todo", feature.scoreBasis.todo],
    ] as const
  )
```

Replace with:

```ts
  const parts = (
    [
      ["shipped", feature.scoreBasis.shipped],
      ["done_unverified", feature.scoreBasis.doneUnverified],
      ["staged", feature.scoreBasis.staged],
      ["in_review", feature.scoreBasis.inReview],
      ["in_progress", feature.scoreBasis.inProgress],
      ["blocked", feature.scoreBasis.blocked],
      ["todo", feature.scoreBasis.todo],
    ] as const
  )
```

- [ ] **Step 3: Verify in the browser**

Open any Feature page, confirm the new "Done, unverified" filter tab appears (count `0` until real data flows through), and switching to it/back doesn't error.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/pages/FeaturePage.tsx
git commit -m "feat: add done_unverified filter tab and status-mix entry to FeaturePage"
```

---

### Task 10: `TodayPage.tsx` + `MilestonePage.tsx` KPI strips

**Files:**
- Modify: `src/components/dashboard/pages/TodayPage.tsx`
- Modify: `src/components/dashboard/pages/MilestonePage.tsx`

**Interfaces:**
- Consumes: `snapshot.kpis.doneUnverified` (Task 4), `MilestoneProgress["doneUnverified"]` (Task 4).

- [ ] **Step 1: Add the stat to `TodayPage.tsx`**

Find:

```tsx
      <StatStrip
        stats={[
          {
            label: "Features tracked",
            value: snapshot.kpis.featuresTracked,
            sublabel:
              snapshot.kpis.lightTierMilestones > 0 ? `${snapshot.kpis.lightTierMilestones} light tier` : undefined,
          },
          { label: "Stories tracked", value: snapshot.kpis.storiesTracked },
          { label: "Shipped to master", value: snapshot.kpis.shipped, color: "var(--status-shipped)" },
          { label: "Staged, not shipped", value: snapshot.kpis.staged, color: "var(--status-staged)" },
          { label: "In review", value: snapshot.kpis.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: snapshot.kpis.blockedOrTodo,
            color: snapshot.kpis.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />
```

Replace with:

```tsx
      <StatStrip
        stats={[
          {
            label: "Features tracked",
            value: snapshot.kpis.featuresTracked,
            sublabel:
              snapshot.kpis.lightTierMilestones > 0 ? `${snapshot.kpis.lightTierMilestones} light tier` : undefined,
          },
          { label: "Stories tracked", value: snapshot.kpis.storiesTracked },
          { label: "Shipped to master", value: snapshot.kpis.shipped, color: "var(--status-shipped)" },
          {
            label: "Done, unverified",
            value: snapshot.kpis.doneUnverified,
            color: "var(--status-done-unverified)",
          },
          { label: "Staged, not shipped", value: snapshot.kpis.staged, color: "var(--status-staged)" },
          { label: "In review", value: snapshot.kpis.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: snapshot.kpis.blockedOrTodo,
            color: snapshot.kpis.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />
```

- [ ] **Step 2: Add the stat to `MilestonePage.tsx`**

Find:

```tsx
      <StatStrip
        stats={[
          { label: "Features tracked", value: milestone.features.length },
          { label: "Stories tracked", value: progress.storiesTracked },
          { label: "Shipped to master", value: progress.shipped, color: "var(--status-shipped)" },
          { label: "Staged, not shipped", value: progress.staged, color: "var(--status-staged)" },
          { label: "In review", value: progress.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: progress.blockedOrTodo,
            color: progress.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />
```

Replace with:

```tsx
      <StatStrip
        stats={[
          { label: "Features tracked", value: milestone.features.length },
          { label: "Stories tracked", value: progress.storiesTracked },
          { label: "Shipped to master", value: progress.shipped, color: "var(--status-shipped)" },
          {
            label: "Done, unverified",
            value: progress.doneUnverified,
            color: "var(--status-done-unverified)",
          },
          { label: "Staged, not shipped", value: progress.staged, color: "var(--status-staged)" },
          { label: "In review", value: progress.inReview, color: "var(--status-in-review)" },
          {
            label: "Blocked or to do",
            value: progress.blockedOrTodo,
            color: progress.blockedOrTodo > 0 ? "var(--status-blocked)" : undefined,
          },
        ]}
      />
```

- [ ] **Step 3: Verify in the browser**

Load the Today page and any Milestone page, confirm both KPI strips render the new stat with no layout breakage.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/pages/TodayPage.tsx src/components/dashboard/pages/MilestonePage.tsx
git commit -m "feat: show done_unverified in the Today and Milestone KPI strips"
```

---

### Task 11: Slack summary — `slack.ts`

**Files:**
- Modify: `src/lib/dashboard/slack.ts`
- Test: `tests/dashboard/slack.test.ts`

**Interfaces:**
- Consumes: `snapshot.kpis.doneUnverified` (Task 4).

- [ ] **Step 1: Write the failing test**

In `tests/dashboard/slack.test.ts`, add (after the existing `"includes a KPI line with the real shipped/staged counts"` test, inside the `describe` block):

```ts
  it("includes a KPI line with the doneUnverified count", () => {
    expect(summary).toContain(String(snapshot.kpis.doneUnverified));
    expect(summary).toContain("Done, unverified");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/dashboard/slack.test.ts`
Expected: FAIL — `"Done, unverified"` is not yet in the summary text (the numeric assertion may pass coincidentally if `doneUnverified` happens to equal another number already in the string — the label assertion is the reliable failure).

- [ ] **Step 3: Add the line**

Find:

```ts
  lines.push("*KPIs*");
  lines.push(`• Features tracked: ${snapshot.kpis.featuresTracked} (+${snapshot.kpis.lightTierMilestones} light-tier)`);
  lines.push(`• Stories tracked: ${snapshot.kpis.storiesTracked}`);
  lines.push(`• Shipped to master: ${snapshot.kpis.shipped}`);
  lines.push(`• Staged, not shipped: ${snapshot.kpis.staged}`);
  lines.push(`• In review: ${snapshot.kpis.inReview}`);
  lines.push(`• Blocked/to do: ${snapshot.kpis.blockedOrTodo}`);
```

Replace with:

```ts
  lines.push("*KPIs*");
  lines.push(`• Features tracked: ${snapshot.kpis.featuresTracked} (+${snapshot.kpis.lightTierMilestones} light-tier)`);
  lines.push(`• Stories tracked: ${snapshot.kpis.storiesTracked}`);
  lines.push(`• Shipped to master: ${snapshot.kpis.shipped}`);
  lines.push(`• Done, unverified: ${snapshot.kpis.doneUnverified}`);
  lines.push(`• Staged, not shipped: ${snapshot.kpis.staged}`);
  lines.push(`• In review: ${snapshot.kpis.inReview}`);
  lines.push(`• Blocked/to do: ${snapshot.kpis.blockedOrTodo}`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/dashboard/slack.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/slack.ts tests/dashboard/slack.test.ts
git commit -m "feat: include done_unverified count in the Slack summary"
```

---

### Task 12: Change feed — `diff.ts` + `ChangeFeedItem.tsx`

**Files:**
- Modify: `src/lib/dashboard/diff.ts`
- Modify: `src/components/dashboard/ChangeFeedItem.tsx`
- Test: `tests/dashboard/diff.test.ts`
- Modify: `tests/dashboard/fixtures/snapshots/2026-08-10.json`, `tests/dashboard/fixtures/snapshots/2026-08-11.json`

**Interfaces:**
- Consumes: `Story["status"]` including `"done_unverified"` (Task 1/2).
- Produces: `ChangeItem` union gains `{ kind: "newly_done_unverified"; feature: FeatureT; story: StoryT }`.

- [ ] **Step 1: Add a done_unverified transition to the diff test fixtures**

The fixtures are schemaVersion-1 shape (`subtasks`, not `stories` — see `renameLegacy` in `schema.ts`, which still parses this). Add a third feature to both fixture files representing a story that flips from `todo` (2026-08-10) to `done_unverified` (2026-08-11).

In `tests/dashboard/fixtures/snapshots/2026-08-10.json`, find the closing of the `features` array — the `}` that ends the `BOUN-200` feature object, immediately before `],` (the array close) and `"reviewQueue": []`. Add a new feature object as the third entry (after `BOUN-200`'s closing `}`, with a comma added after that `}`):

```json
    {
      "key": "BOUN-300",
      "code": "F1.3",
      "title": "Third feature",
      "milestone": "M1",
      "tier": "full",
      "owner": "Alice",
      "repos": ["service-a"],
      "stage": "not_started",
      "score": 0,
      "scoreBasis": {
        "shipped": 0,
        "doneUnverified": 0,
        "staged": 0,
        "inReview": 0,
        "inProgress": 0,
        "blocked": 0,
        "todo": 1,
        "total": 1
      },
      "scoreOverride": null,
      "confidence": "medium",
      "rationale": "One subtask not started.",
      "daysSinceLastActivity": 1,
      "daysInStaged": null,
      "releaseGate": null,
      "acCoverage": [],
      "subtasks": [
        {
          "key": "SUB-4",
          "summary": "Sign off on the thing",
          "jiraStatus": "To Do",
          "status": "todo",
          "assignee": "Alice",
          "updatedAt": "2026-08-09T00:00:00.000Z",
          "prs": []
        }
      ],
      "callouts": [],
      "override": null,
      "dataOk": true
    }
```

Also update this file's `headline` and `kpis` blocks — find:

```json
  "headline": { "featuresWithNothingOnMaster": 1, "totalFeatures": 2, "sentence": "1 of 2 features have nothing shipped to master yet." },
```

Replace with:

```json
  "headline": { "featuresWithNothingOnMaster": 3, "totalFeatures": 3, "sentence": "3 of 3 features have nothing shipped to master yet." },
```

(BOUN-300 has `scoreBasis.shipped === 0`, same as BOUN-100 and BOUN-200 at this point in the fixture — all three now count toward `featuresWithNothingOnMaster`.)

Find:

```json
  "kpis": {
    "featuresTracked": 2,
    "lightTierMilestones": 0,
    "subtasksTracked": 3,
    "shipped": 0,
    "staged": 1,
    "inReview": 0,
    "blockedOrTodo": 1
  },
```

Replace with:

```json
  "kpis": {
    "featuresTracked": 3,
    "lightTierMilestones": 0,
    "subtasksTracked": 4,
    "shipped": 0,
    "doneUnverified": 0,
    "staged": 1,
    "inReview": 0,
    "blockedOrTodo": 2
  },
```

In `tests/dashboard/fixtures/snapshots/2026-08-11.json`, add the corresponding `BOUN-300` feature (this file already mirrors 2026-08-10's structure with the shipped/blocked transitions applied) as a third entry in `features`, after `BOUN-200`'s closing `}` — with `SUB-4` now `done_unverified`:

```json
    {
      "key": "BOUN-300",
      "code": "F1.3",
      "title": "Third feature",
      "milestone": "M1",
      "tier": "full",
      "owner": "Alice",
      "repos": ["service-a"],
      "stage": "nearly_done",
      "score": 100,
      "scoreBasis": {
        "shipped": 0,
        "doneUnverified": 1,
        "staged": 0,
        "inReview": 0,
        "inProgress": 0,
        "blocked": 0,
        "todo": 0,
        "total": 1
      },
      "scoreOverride": null,
      "confidence": "medium",
      "rationale": "JIRA marks this Done; no PR confirms it reached master.",
      "daysSinceLastActivity": 0,
      "daysInStaged": null,
      "releaseGate": null,
      "acCoverage": [],
      "subtasks": [
        {
          "key": "SUB-4",
          "summary": "Sign off on the thing",
          "jiraStatus": "Done",
          "status": "done_unverified",
          "assignee": "Alice",
          "updatedAt": "2026-08-11T00:00:00.000Z",
          "prs": []
        }
      ],
      "callouts": [],
      "override": null,
      "dataOk": true
    }
```

Also update this file's `headline` and `kpis` blocks — find:

```json
  "headline": { "featuresWithNothingOnMaster": 0, "totalFeatures": 2, "sentence": "All tracked features have shipped something to master." },
  "kpis": { "featuresTracked": 2, "lightTierMilestones": 0, "subtasksTracked": 3, "shipped": 1, "staged": 0, "inReview": 0, "blockedOrTodo": 2 },
```

Replace with:

```json
  "headline": { "featuresWithNothingOnMaster": 2, "totalFeatures": 3, "sentence": "2 of 3 features have nothing shipped to master yet." },
  "kpis": { "featuresTracked": 3, "lightTierMilestones": 0, "subtasksTracked": 4, "shipped": 1, "doneUnverified": 1, "staged": 0, "inReview": 0, "blockedOrTodo": 2 },
```

(BOUN-100 still has a shipped PR, so `featuresWithNothingOnMaster` covers only BOUN-200 and the new BOUN-300; `blockedOrTodo` is unchanged at 2 — SUB-4 moved from `todo` to `done_unverified`, not to `blocked`/`todo`, and BOUN-200's SUB-3 `blocked` count is untouched.)

- [ ] **Step 2: Write the failing test**

In `tests/dashboard/diff.test.ts`, add (inside the `describe("computeChanges", ...)` block):

```ts
  it("produces a 'newly_done_unverified' item for the story that flipped from todo to done_unverified", () => {
    const changes = computeChanges(current, previous);
    const doneUnverified = changes.filter((c) => c.kind === "newly_done_unverified");
    expect(doneUnverified).toHaveLength(1);
    expect(doneUnverified[0]!.story.key).toBe("SUB-4");
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/dashboard/diff.test.ts`
Expected: FAIL — `computeChanges` doesn't detect `done_unverified` transitions yet, so the filter returns an empty array.

- [ ] **Step 4: Update `diff.ts`**

Find:

```ts
export type ChangeItem =
  | { kind: "shipped"; feature: FeatureT; story: StoryT; pr: PrRefT; scoreDelta: number }
  | { kind: "newly_staged"; feature: FeatureT; story: StoryT; integrationBranch: string }
  | { kind: "newly_blocked"; feature: FeatureT; story: StoryT }
  | { kind: "newly_stalled"; feature: FeatureT; daysSinceLastActivity: number };
```

Replace with:

```ts
export type ChangeItem =
  | { kind: "shipped"; feature: FeatureT; story: StoryT; pr: PrRefT; scoreDelta: number }
  | { kind: "newly_done_unverified"; feature: FeatureT; story: StoryT }
  | { kind: "newly_staged"; feature: FeatureT; story: StoryT; integrationBranch: string }
  | { kind: "newly_blocked"; feature: FeatureT; story: StoryT }
  | { kind: "newly_stalled"; feature: FeatureT; daysSinceLastActivity: number };
```

Find:

```ts
      if (story.status === "shipped" && previousStatus !== "shipped") {
        const pr = storyPrs(story).find((p) => p.shippedToDefault);
        if (pr) {
          const scoreDelta = previousFeature ? feature.score - previousFeature.score : feature.score;
          changes.push({ kind: "shipped", feature, story, pr, scoreDelta });
        }
      } else if (story.status === "staged" && previousStatus !== "staged") {
```

Replace with:

```ts
      if (story.status === "shipped" && previousStatus !== "shipped") {
        const pr = storyPrs(story).find((p) => p.shippedToDefault);
        if (pr) {
          const scoreDelta = previousFeature ? feature.score - previousFeature.score : feature.score;
          changes.push({ kind: "shipped", feature, story, pr, scoreDelta });
        }
      } else if (story.status === "done_unverified" && previousStatus !== "done_unverified") {
        changes.push({ kind: "newly_done_unverified", feature, story });
      } else if (story.status === "staged" && previousStatus !== "staged") {
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/dashboard/diff.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 6: Render the new change kind in `ChangeFeedItem.tsx`**

Find:

```tsx
    case "newly_staged":
      return (
        <Row
          status="staged"
          headline="Moved to staged"
          detail={
            <>
              <span className="font-mono-data">{change.story.key}</span> merged into{" "}
              <code className="rounded-sm bg-muted px-1.5 py-0.5">{change.integrationBranch}</code>, not master.
            </>
          }
          attribution={`${change.feature.code} · ${change.feature.owner}`}
        />
      )
```

Replace with:

```tsx
    case "newly_done_unverified":
      return (
        <Row
          status="done_unverified"
          headline="Marked Done, unverified"
          detail={
            <>
              <span className="font-mono-data">{change.story.key}</span> — JIRA says Done, but no PR confirms it
              reached master.
            </>
          }
          attribution={`${change.feature.code} · ${change.feature.owner}`}
        />
      )
    case "newly_staged":
      return (
        <Row
          status="staged"
          headline="Moved to staged"
          detail={
            <>
              <span className="font-mono-data">{change.story.key}</span> merged into{" "}
              <code className="rounded-sm bg-muted px-1.5 py-0.5">{change.integrationBranch}</code>, not master.
            </>
          }
          attribution={`${change.feature.code} · ${change.feature.owner}`}
        />
      )
```

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: PASS — every suite, including `tests/dashboard/diff.test.ts`, `tests/dashboard/slack.test.ts` (its fixture snapshot now includes the extra `BOUN-300` feature — re-check that its existing assertions, which iterate `snapshot.features`, still pass with the added feature; they use generic loops (`for (const feature of snapshot.features)`), so they should).

- [ ] **Step 8: Verify in the browser**

Load the Today page (against real, current data — not the test fixtures) and confirm the change feed renders without error even with zero `newly_done_unverified` items today.

- [ ] **Step 9: Commit**

```bash
git add src/lib/dashboard/diff.ts src/components/dashboard/ChangeFeedItem.tsx tests/dashboard/diff.test.ts tests/dashboard/fixtures/snapshots/2026-08-10.json tests/dashboard/fixtures/snapshots/2026-08-11.json
git commit -m "feat: surface newly done_unverified stories in the change feed"
```

---

### Task 13: `MethodologyFooter.tsx` copy

**Files:**
- Modify: `src/components/dashboard/MethodologyFooter.tsx`

**Interfaces:**
- Consumes: nothing new (static copy).

- [ ] **Step 1: Extend the methodology copy**

Find:

```tsx
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Shipped vs. staged</h2>
        <p className="m-0">
          <strong className="text-foreground">Shipped</strong> means a pull request merged into the repo's default
          branch. <strong className="text-foreground">Staged</strong> means it merged, but into an integration or
          release branch — the code exists, but it isn't live. A staged story is never counted as shipped, and the
          two are never summed together.
        </p>
      </div>
```

Replace with:

```tsx
      <div>
        <h2 className="m-0 mb-1 text-sm font-semibold text-foreground">Shipped vs. done-unverified vs. staged</h2>
        <p className="m-0">
          <strong className="text-foreground">Shipped</strong> means a pull request merged into the repo's default
          branch. <strong className="text-foreground">Done, unverified</strong> means JIRA marks the ticket Done —
          product signed off — but no PR proves the code reached master; it counts toward progress the same as
          shipped, since sign-off happened, but is always shown separately so that gap stays visible.{" "}
          <strong className="text-foreground">Staged</strong> means it merged, but into an integration or release
          branch — the code exists, but it isn't live. None of the three are ever summed together.
        </p>
      </div>
```

- [ ] **Step 2: Verify in the browser**

Load the Today page, scroll to the methodology footer, confirm the updated copy renders correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/MethodologyFooter.tsx
git commit -m "docs: explain done_unverified in the methodology footer"
```

---

### Task 14: Full verification and real-data sanity check

**Files:** none (verification only)

**Interfaces:** none — this task confirms every prior task's interfaces actually compose correctly end-to-end.

- [ ] **Step 1: Full typecheck and test suite**

Run: `pnpm build && pnpm test`
Expected: both succeed with zero errors/failures. If `pnpm build` surfaces a type error in a file this plan didn't touch, that's a spot the plan missed — fix it following the same pattern as the nearest analogous task above (e.g. another `Record<WorkStatus, ...>` mapping), then re-run.

- [ ] **Step 2: Re-run the real collection pipeline and confirm BOUN-11251/11273/11295/11303 reclassify correctly**

Run: `pnpm collect`

This re-fetches live JIRA/GitHub data into `data/raw/<today>.json` and `data/pending/<today>.json` using the updated `deriveWorkStatus`. Then inspect the result:

```bash
python3 -c "
import json, glob
path = sorted(glob.glob('data/raw/*.json'))[-1]
d = json.load(open(path))
for f in d['features']:
    for s in f.get('stories', []):
        if s['key'] in ('BOUN-11251', 'BOUN-11273', 'BOUN-11295', 'BOUN-11303'):
            print(s['key'], '->', s['status'])
"
```

Expected: all four print `done_unverified` — BOUN-11251 (JIRA Done, PR #2044 closed unmerged) and BOUN-11273/11295/11303 (JIRA Done presumably, PRs merged into a non-master branch in the stack) should no longer show the old mixed `shipped`/`staged` result.

If any of the three stacked stories (BOUN-11273/11295/11303) is NOT actually JIRA "Done" (only BOUN-11251 was confirmed Done in this conversation), it will correctly stay `staged` instead of becoming `done_unverified` — that's the intended, unchanged behavior for non-Done tickets. Note which of the four actually changed status and report that back rather than assuming all four flip.

- [ ] **Step 3: Run the judge + merge steps to produce a full snapshot, and spot-check the rendered page**

Follow the project's existing daily routine (see `README.md` and the `judge` skill) to produce `data/judgment/<today>.json`, then run `pnpm merge`. Start the dev server, open the Today page and the affected features' pages (F1.5.2/F1.5.3/F1.5.4, matching BOUN-11273/11295/11303's milestone), and confirm:
- The KPI strip shows a nonzero "Done, unverified" count.
- The affected stories' `StatusPill`s show "Done, unverified" in the new amber tone, not "Staged".
- The epic header's segmented bar includes a visible done-unverified segment.
- The methodology footer explains the new state.

- [ ] **Step 4: Report results**

Summarize which of BOUN-11251/11273/11295/11303 actually reclassified, and confirm no regressions in existing shipped/staged/in_review/blocked/todo stories elsewhere in the epic (spot-check a few features unrelated to F1.5 to confirm they render exactly as before).

No commit for this task — it's verification of everything already committed in Tasks 1-13.
