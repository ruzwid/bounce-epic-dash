# `done_unverified` work status

## Problem

`deriveWorkStatus` (`src/lib/classify.ts`) currently has two blind spots where a
JIRA "Done" status (with product sign-off) and GitHub's actual merge state
disagree, and the tool resolves the disagreement wrong in both directions:

1. **JIRA Done + a PR merged into a non-master branch** → downgraded to
   `"staged"`, discarding the fact that product already signed off. This is
   what surfaced the issue: BOUN-11273/11295/11303 are stacked PRs
   (`#2045`, `#2046`, `#2048`), each merged into the branch below it rather
   than `master`, so they read as "staged" even though the tickets are Done.
2. **JIRA Done + no merged evidence at all** (PR closed unmerged, or no
   linked PR) → silently falls through to trusting the raw JIRA status and
   shows as plain `"shipped"`, with nothing distinguishing it from a PR that
   actually, verifiably landed on master. BOUN-11251's PR (`#2044`) was
   closed without merging; the ticket still reads `"shipped"` today.

Both cases erase real information. The fix is a third status,
`done_unverified`, that means: *JIRA says Done (sign-off happened), but
GitHub cannot confirm the code is on master.*

## Goals

- Stop discarding sign-off information (case 1) and stop hiding the
  proof-gap (case 2) — both collapse into one honest, explicit status.
- Preserve the existing guarantee that `"shipped"` means GitHub-verified
  merge to the default branch — `done_unverified` must never be counted or
  displayed as `"shipped"`.
- Respect product sign-off in the progress percentage: `done_unverified`
  earns the same score weight as `shipped`.
- Keep the top-line "done" stage badge honest: a milestone/feature must
  still not read as fully `"done"` unless every story is *literally*
  GitHub-verified `"shipped"` — `done_unverified` stories block that gate,
  even at 100% score.

## Non-goals

- No change to how non-Done tickets are classified (`staged`, `in_review`,
  `todo`, `in_progress`, `blocked` logic for tickets JIRA doesn't call Done
  is untouched).
- No backfill of historical snapshots — old `data/snapshots/*.json` keep
  whatever status they were computed with; this only changes classification
  going forward.
- No change to `traceStackChain` / `findReleaseGate` — those remain
  display-only evidence, not classification inputs.

## Architecture

### 1. Classification — `src/lib/classify.ts`

`deriveWorkStatus` becomes:

```
base = statusMap[jiraStatus]                      // unchanged fallback + warning
if any PR shippedToDefault(pr):  return "shipped"          // unchanged — real proof always wins
if base === "shipped":            return "done_unverified"  // NEW — catches merged-elsewhere,
                                                              // closed-unmerged, and no-PR-at-all
                                                              // in one branch, since base is only
                                                              // "shipped" when JIRA already says Done
if any PR state === MERGED:       return "staged"           // unchanged, only reached for non-Done base
if any PR state === OPEN:         return "in_review"        // unchanged
else:                              return base
```

The `done_unverified` branch sits between the `shipped` check and the
`staged` check, so it intercepts every remaining Done case before the
generic merged/open/fallback logic runs. Non-Done tickets never hit it,
because `base` won't equal `"shipped"` for them.

### 2. Schema — `src/lib/schema.ts`

Add `"done_unverified"` to the `WorkStatus` enum, between `"shipped"` and
`"staged"`:

```ts
export const WorkStatus = z.enum([
  "shipped", "done_unverified", "staged", "in_review", "in_progress", "blocked", "todo",
]);
```

### 3. Config — `src/lib/config-schema.ts` + `config.yaml`

Add `done_unverified` to `ScoreWeights`:

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

Default value in `config.yaml`: equal to `scoreWeights.shipped` (full
credit). This is a required field (no `.default()`), matching the existing
weights, so the config file must be updated in the same change — a missing
weight should fail loudly at config load, not silently score as 0.

### 4. Scoring — `src/lib/score.ts`

`ScoreBasis` gets its own counter, tracked separately from `shipped`:

```ts
export type ScoreBasis = {
  shipped: number;
  doneUnverified: number;   // NEW
  staged: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  todo: number;
  total: number;
};
```

`STATUS_TO_BASIS_KEY` gets `done_unverified: "doneUnverified"`. The
weighted-mean math in `computeScore` is unchanged (it already iterates
`weights[status]` generically) — `done_unverified` stories contribute
`weights.done_unverified` (= `weights.shipped`) to the sum, so the
percentage treats them as full credit while the raw basis count stays
distinct from `shipped` for display accuracy.

`deriveStage` itself needs no code change. Its `"done"` gate is driven by
`allStoriesShippedToDefault`, computed at the call sites
(`scripts/collect.ts:341`, `scripts/merge.ts:172`) as
`stories.every(s => s.status === "shipped")`. Since `done_unverified !==
"shipped"`, that check already excludes it correctly — a feature can hit
100% score via sign-off credit but reports stage `"nearly_done"` until
every story is a literal, GitHub-verified `"shipped"`.

### 5. Display

- **`src/lib/dashboard/statusLabels.ts`** — add
  `done_unverified: "Done, unverified"` to `WORK_STATUS_LABELS`.
- **Color** — new CSS variable `--status-done-unverified` (amber/caution
  tone, distinct from `--status-shipped` green and `--status-staged`) in
  `src/styles.css`, alongside the existing status color variables.
- **`src/components/dashboard/PrChip.tsx`** — the `staged: "merged into an
  integration branch"` explanatory-text pattern gets a parallel entry for
  `done_unverified` explaining *why* it's unverified (no PR, closed PR, or
  merged into a non-master branch) — reuse whatever evidence is on hand
  (closed PR, or the merged-elsewhere PR) rather than a single fixed string.
- **`src/components/dashboard/FeatureCard.tsx`**,
  **`src/components/dashboard/pages/FeaturePage.tsx`** — add a
  `done_unverified` filter tab alongside the existing `staged` one
  (`FeaturePage.tsx:35`).
- **`src/components/dashboard/BurnUpChart.tsx`**,
  **`src/lib/dashboard/burnup.ts`**, **`StoryStatusMixChart.tsx`** — add a
  third series/segment for `done_unverified`, kept visually separate from
  `shipped` even though it scores the same, so a viewer can see how much of
  the progress line is sign-off-trust vs. GitHub-verified.
- **`src/components/dashboard/pages/TodayPage.tsx`**,
  **`MilestonePage.tsx`** — add a third KPI stat row, "Done, unverified: N",
  next to "Shipped to master" and "Staged, not shipped".
- **`src/components/dashboard/MethodologyFooter.tsx`** — extend the
  "Shipped vs. staged" copy to explain the third state, e.g.: *"Done,
  unverified means JIRA marks the ticket Done, but no GitHub PR proves the
  code reached master — it still counts toward progress, but the two are
  shown separately so the gap stays visible."*
- **`src/lib/dashboard/diff.ts`** — add a `newly_done_unverified` change
  kind, mirroring the existing `newly_staged` kind (triggered when
  `story.status === "done_unverified" && previousStatus !== "done_unverified"`),
  so it appears in the daily change feed like shipped/staged transitions do.
- **`src/lib/dashboard/slack.ts`** — add a
  `Done, unverified: ${snapshot.kpis.doneUnverified}` line to the Slack
  summary, next to the existing shipped/staged lines.
- **`src/lib/dashboard/nav.ts`** — wherever it reads `scoreBasis`/KPIs for
  sidebar counts, thread through the new `doneUnverified` field.

## Data flow

No pipeline restructuring: `scripts/collect.ts` and `scripts/merge.ts`
already call `deriveWorkStatus` / `computeScore` / `deriveStage` generically
over whatever `WorkStatus` values exist — adding the new enum member and its
weight is sufficient for the pipeline to produce correct `pending.json` /
`raw.json` / snapshot output. No new network calls or JIRA/GitHub fields
are needed; this is pure reclassification of data already being fetched.

## Error handling

- Config load must fail loudly (existing Zod validation) if
  `scoreWeights.done_unverified` is missing from `config.yaml` — no
  silent-zero default, matching how the other weights are required today.
- `deriveWorkStatus`'s existing "unmapped JIRA status" warning path is
  unaffected — `done_unverified` is derived from GitHub evidence layered on
  top of an already-resolved `base`, never from an unmapped status.

## Testing

- Unit tests for `deriveWorkStatus` (`src/lib/classify.ts`) covering: Done +
  PR merged into non-master → `done_unverified`; Done + PR closed unmerged →
  `done_unverified`; Done + no PRs → `done_unverified`; Done + a PR
  `shippedToDefault` → still `"shipped"` (real proof wins); non-Done + PR
  merged into non-master → still `"staged"` (unchanged).
- Unit tests for `computeScore` confirming `done_unverified` contributes the
  configured weight to the weighted mean and increments
  `scoreBasis.doneUnverified`, not `scoreBasis.shipped`.
- Unit test confirming `deriveStage` still reports `"nearly_done"`, not
  `"done"`, when score is 100 but one story is `done_unverified`.
- Snapshot/fixture check: re-run `scripts/collect.ts` (or its test
  fixtures) against BOUN-11251/11273/11295/11303 and confirm all four now
  read `done_unverified` instead of the current mixed `shipped`/`staged`.

## Scope check

This is a single, cohesive change: one new enum value threaded through
classification → scoring → display. It touches many files because the
codebase deliberately keeps status handling explicit at every layer rather
than behind a shared abstraction (consistent with the existing shipped/staged
split) — the design doesn't introduce new abstractions, it extends the
existing per-layer pattern by one more case.
