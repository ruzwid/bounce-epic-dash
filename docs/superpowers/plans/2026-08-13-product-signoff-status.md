# Product Sign-Off Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch JIRA's "Product Sign Off" custom field (`customfield_10698`, values `Pending`/`Approved`) on every Feature ticket. When Approved, the feature's `stage` becomes `"done"` unconditionally — regardless of score or story mix — because product's explicit sign-off is a stronger, human-verified signal than the GitHub-derived `done_unverified` status this dashboard otherwise insists on. Milestone/sidebar/Today-page "done" collapsing already cascades from `feature.stage === "done"` with no code changes needed. Add a new, collapsed-by-default section to the Needs Attention page listing `done_unverified` stories that only read as fine because their feature was signed off — visible on request, not by default. Separately, restyle the Needs Attention page's card header to match the Reviews page's link/icon conventions.

**Architecture:** One new boolean (`signedOff`) threaded from a JIRA field fetch through `collect.ts` → `RawFeature` → `score.ts`'s `deriveStage` → `merge.ts`'s snapshot build. Nothing published to the `Feature` schema — `stage === "done"` combined with a `done_unverified` story is already, by construction, only reachable via sign-off (the ordinary "done" path requires every story literally `shipped`), so no new field is needed for the Needs Attention page's selector logic.

**Tech Stack:** TypeScript, Zod, Vitest, React 19, JIRA REST API v3.

## Global Constraints

- JIRA field: `customfield_10698` ("Product Sign Off"), a single-select field with exactly two possible values: `"Pending"` and `"Approved"` (confirmed via `/rest/api/3/issue/BOUN-11211/editmeta`). Treat any other value (including missing/null) as not signed off — never throw on an unexpected value.
- `signedOff: boolean` = `fields.customfield_10698?.value === "Approved"`.
- When `signedOff` is true, `deriveStage` returns `"done"` unconditionally — before any score-band check. This is a deliberate, explicit product decision (confirmed): sign-off overrides regardless of remaining `todo`/`in_progress`/`blocked` stories, not just `done_unverified` ones.
- `score` itself is NOT forced to 100 when signed off — it stays the honest weighted number. Stage and score are decoupled here the same way `scoreOverride` already decouples them elsewhere in this codebase.
- No new field is added to the published `Feature` Zod schema. `signedOff` lives only in `RawFeature` (collect.ts/merge.ts internal pipeline types).
- Milestone/epic "done" cascading (`nav.ts`'s `milestoneProgress`/`epicStage`, `Sidebar.tsx`, `TodayPage.tsx` collapse-by-default) already derives from `feature.stage === "done"` with zero code changes — verify this in Task 6, do not add redundant logic.
- The Needs Attention page's new section shows exactly: stories where `story.status === "done_unverified"` AND the story's feature has `stage === "done"`. Collapsed (`<details>` closed) by default.
- Run `pnpm test` after every task with existing test coverage, before moving to the next task.

---

### Task 1: `deriveStage` gains a `signedOff` override

**Files:**
- Modify: `src/lib/score.ts`
- Test: `tests/score.test.ts`

**Interfaces:**
- Produces: `deriveStage(score: number, allStoriesShippedToDefault: boolean, signedOff?: boolean): Stage` — `signedOff` defaults to `false`, so every existing call site (`nav.ts`'s two call sites, which pass 2 args) is unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/score.test.ts`, inside `describe("deriveStage", ...)`:

```ts
  it("is 'done' when signedOff is true, even at score 0", () => {
    expect(deriveStage(0, false, true)).toBe("done");
  });

  it("is 'done' when signedOff is true, even with stories not all shipped", () => {
    expect(deriveStage(60, false, true)).toBe("done");
  });

  it("defaults signedOff to false, unaffected when the 3rd argument is omitted", () => {
    expect(deriveStage(100, false)).toBe("nearly_done");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/score.test.ts`
Expected: the first two new tests FAIL (current `deriveStage` takes only 2 params, `signedOff` is ignored/undefined and the function falls through to score-based bands). The third passes already.

- [ ] **Step 3: Update `deriveStage`**

In `src/lib/score.ts`, find:

```ts
export function deriveStage(score: number, allStoriesShippedToDefault: boolean): Stage {
  if (score === 0) return "not_started";
  if (score < 25) return "early";
  if (score < 70) return "underway";
  if (score < 100) return "nearly_done";
  return allStoriesShippedToDefault ? "done" : "nearly_done";
}
```

Replace with:

```ts
export function deriveStage(score: number, allStoriesShippedToDefault: boolean, signedOff = false): Stage {
  if (signedOff) return "done";
  if (score === 0) return "not_started";
  if (score < 25) return "early";
  if (score < 70) return "underway";
  if (score < 100) return "nearly_done";
  return allStoriesShippedToDefault ? "done" : "nearly_done";
}
```

Update the doc comment immediately above it (currently explains the 0/25/70/100 bands and the `allStoriesShippedToDefault` requirement) to add one sentence: product sign-off (`signedOff`) overrides every band unconditionally — a human, out-of-band approval outranks both the score and the GitHub-verified-shipped requirement.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/score.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/score.ts tests/score.test.ts
git commit -m "feat: deriveStage returns done unconditionally when signedOff"
```

---

### Task 2: Fetch and thread `signedOff` through `collect.ts`

**Files:**
- Modify: `scripts/collect.ts`
- Test: `tests/collect.test.ts`

**Interfaces:**
- Consumes: `deriveStage(score, allShippedToDefault, signedOff)` (Task 1).
- Produces: `RawFeature["signedOff"]: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `tests/collect.test.ts`, inside `describe("collectFeature", ...)`:

```ts
  it("marks the feature signedOff when JIRA's Product Sign Off field is Approved", async () => {
    const d = deps({
      getIssue: vi.fn().mockResolvedValue({
        key: "TEST-10",
        fields: { description: null, customfield_10698: { value: "Approved" } },
      }),
    });
    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([]));
    expect(feature.signedOff).toBe(true);
  });

  it("is not signedOff when Product Sign Off is Pending", async () => {
    const d = deps({
      getIssue: vi.fn().mockResolvedValue({
        key: "TEST-10",
        fields: { description: null, customfield_10698: { value: "Pending" } },
      }),
    });
    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([]));
    expect(feature.signedOff).toBe(false);
  });

  it("is not signedOff when the field is missing entirely", async () => {
    const { feature } = await collectFeature(target(), CONFIG, NOW, deps(), index([]));
    expect(feature.signedOff).toBe(false);
  });

  it("becomes stage 'done' when signedOff, even with an unshipped story", async () => {
    const d = deps({
      searchChildren: childrenBy({ "TEST-10": [jiraIssue("TEST-11", "To Do")] }),
      getIssue: vi.fn().mockResolvedValue({
        key: "TEST-10",
        fields: { description: null, customfield_10698: { value: "Approved" } },
      }),
    });
    const { feature } = await collectFeature(target(), CONFIG, NOW, d, index([]));
    expect(feature.stage).toBe("done");
  });
```

(These reuse this file's existing `target()`, `deps()`, `childrenBy()`, `jiraIssue()`, `index()` helpers — read the top of the file for their exact signatures if unfamiliar; they're already used throughout the `describe("collectFeature", ...)` block above.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/collect.test.ts`
Expected: FAIL — `feature.signedOff` is `undefined`, not `boolean`; the last test gets `stage` from the ordinary score bands instead of `"done"`.

- [ ] **Step 3: Add `signedOff` to `RawFeature` and `buildRawFeature`**

In `scripts/collect.ts`, find (inside the `RawFeature` type):

```ts
  stories: RawStory[];
  dataOk: boolean;
```

Replace with:

```ts
  stories: RawStory[];
  /** JIRA's "Product Sign Off" field (customfield_10698) is "Approved" —
   *  a human, out-of-band approval that overrides deriveStage's normal
   *  score/shipped-based bands (see src/lib/score.ts). Never published to
   *  the Feature schema; stage === "done" combined with a story that's
   *  still done_unverified is, by construction, only reachable this way. */
  signedOff: boolean;
  dataOk: boolean;
```

Find, in `buildRawFeature`'s params type:

```ts
  now: Date;
  dataOk: boolean;
  scoreWeights: Config["scoreWeights"];
}): RawFeature {
  const { target, stories, acBullets, overview = "", releaseGate, repos = [], now, dataOk, scoreWeights } = params;
  const { score, scoreBasis } = computeScore(stories.map((s) => s.status), scoreWeights);
  const allShippedToDefault = stories.length > 0 && stories.every((s) => s.status === "shipped");
  const stage = deriveStage(score, allShippedToDefault);
```

Replace with:

```ts
  now: Date;
  dataOk: boolean;
  signedOff: boolean;
  scoreWeights: Config["scoreWeights"];
}): RawFeature {
  const { target, stories, acBullets, overview = "", releaseGate, repos = [], now, dataOk, signedOff, scoreWeights } = params;
  const { score, scoreBasis } = computeScore(stories.map((s) => s.status), scoreWeights);
  const allShippedToDefault = stories.length > 0 && stories.every((s) => s.status === "shipped");
  const stage = deriveStage(score, allShippedToDefault, signedOff);
```

Find, in the same function's return object:

```ts
    releaseGate,
    acBullets,
    overview,
    stories,
    dataOk,
  };
```

Replace with:

```ts
    releaseGate,
    acBullets,
    overview,
    stories,
    signedOff,
    dataOk,
  };
```

- [ ] **Step 4: Fetch the field and pass `signedOff` at both `buildRawFeature` call sites**

Find, in `collectFeature`:

```ts
    [storyIssues, parentIssue] = await Promise.all([
      deps.searchChildren(target.key),
      deps.getIssue(target.key),
    ]);
```

Replace with:

```ts
    [storyIssues, parentIssue] = await Promise.all([
      deps.searchChildren(target.key),
      deps.getIssue(target.key, ["summary", "description", "status", "assignee", "updated", "customfield_10698"]),
    ]);
```

Find the early-return branch (JIRA failure) inside `collectFeature`:

```ts
  } catch (err) {
    errors.push({ source: "jira", scope: target.key, message: errMsg(err) });
    return {
      feature: buildRawFeature({
        target,
        stories: [],
        acBullets: [],
        releaseGate: null,
        now,
        dataOk: false,
        scoreWeights: config.scoreWeights,
      }),
      errors,
    };
  }
```

Replace with:

```ts
  } catch (err) {
    errors.push({ source: "jira", scope: target.key, message: errMsg(err) });
    return {
      feature: buildRawFeature({
        target,
        stories: [],
        acBullets: [],
        releaseGate: null,
        now,
        dataOk: false,
        signedOff: false,
        scoreWeights: config.scoreWeights,
      }),
      errors,
    };
  }
```

(A JIRA fetch failure means we never got the sign-off field either — never assume signed off from a failed read.)

Then, after the `description`/`liveTitle` extraction (which already reads `parentIssue.fields` via a local `fieldsOf`-like cast — read the current code around there to match the existing style exactly), add a `signedOff` computation. Find:

```ts
  const description = (parentIssue.fields as Record<string, unknown>).description;
  const acBullets = extractAcBullets(description).map((text, i) => ({ id: `ac-${i + 1}`, text }));
  const overview = extractOverview(description);
```

Replace with:

```ts
  const description = (parentIssue.fields as Record<string, unknown>).description;
  const acBullets = extractAcBullets(description).map((text, i) => ({ id: `ac-${i + 1}`, text }));
  const overview = extractOverview(description);
  const productSignOff = (parentIssue.fields as Record<string, unknown>).customfield_10698 as
    | { value?: string }
    | null
    | undefined;
  const signedOff = productSignOff?.value === "Approved";
```

Finally, find the success-path `buildRawFeature` call:

```ts
  return {
    feature: buildRawFeature({
      target: resolvedTarget,
      stories,
      acBullets,
      overview,
      releaseGate,
      // The repos this feature's work actually landed in, derived from the
      // PRs attributed to it — not declared up front. A feature with no
      // PRs yet reports none, which is the honest answer.
      repos: [...new Set(allFeaturePrs.map((pr) => pr.repo))].sort(),
      now,
      dataOk: !prIndex.degraded,
      scoreWeights: config.scoreWeights,
    }),
    errors,
  };
```

Replace with:

```ts
  return {
    feature: buildRawFeature({
      target: resolvedTarget,
      stories,
      acBullets,
      overview,
      releaseGate,
      // The repos this feature's work actually landed in, derived from the
      // PRs attributed to it — not declared up front. A feature with no
      // PRs yet reports none, which is the honest answer.
      repos: [...new Set(allFeaturePrs.map((pr) => pr.repo))].sort(),
      now,
      dataOk: !prIndex.degraded,
      signedOff,
      scoreWeights: config.scoreWeights,
    }),
    errors,
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/collect.test.ts`
Expected: PASS — all tests in the file. If other pre-existing tests in this file construct a `RawFeature` object literal directly (not via `buildRawFeature`/`collectFeature`), they will now fail to type-check — search the file for any such literal and add `signedOff: false` to it. Report back precisely which (if any) needed this so the plan's understanding stays accurate.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS. `tests/merge.test.ts`'s `makeRawFeature` helper constructs a `RawFeature`-shaped object and will now fail to type-check (missing `signedOff`) — this is expected and is fixed in Task 3, not here. Confirm the ONLY new failures are in `tests/merge.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add scripts/collect.ts tests/collect.test.ts
git commit -m "feat: fetch and derive signedOff from JIRA's Product Sign Off field"
```

---

### Task 3: Thread `signedOff` through `merge.ts`

**Files:**
- Modify: `scripts/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: `RawFeature["signedOff"]` (Task 2).

- [ ] **Step 1: Fix the `makeRawFeature` test fixture**

In `tests/merge.test.ts`, find (inside `makeRawFeature`'s returned object, before `...overrides`):

```ts
    dataOk: true,
    ...overrides,
```

Replace with:

```ts
    dataOk: true,
    signedOff: false,
    ...overrides,
```

- [ ] **Step 1b: Fix the `makeFeature` test fixture in `tests/collect-pending-body.test.ts`**

Discovered during Task 2: this file has its own `RawFeature`-shaped test helper (`makeFeature`, not `makeRawFeature`) that also breaks `tsc --noEmit` (does not fail `pnpm test`, since Vitest doesn't type-check — same pattern as other fixture gaps found during the `done_unverified` plan). Find the `makeFeature` helper's returned object and add `signedOff: false,` in the same position/style as the fix above — read the current helper first (it may not have the exact same field ordering as `makeRawFeature`).

- [ ] **Step 2: Write the failing test**

Add to `tests/merge.test.ts`, inside `describe("buildSnapshot", ...)`:

```ts
  it("reports stage 'done' when the raw feature is signedOff, even with an unshipped story", () => {
    const rawFeatures = [
      makeRawFeature({
        signedOff: true,
        score: 50,
        stage: "underway",
        stories: [
          {
            key: "TEST-11",
            summary: "Sub A",
            jiraStatus: "To Do",
            status: "todo",
            assignee: "Alice",
            updatedAt: "2026-01-13T00:00:00.000Z",
            prs: [],
            subtasks: [],
          },
        ],
      }),
    ];
    const snapshot = buildSnapshot({
      date: "2026-01-15",
      epic: { key: "TEST-1", title: "Test Epic", targetDate: null },
      rawFeatures,
      judgment: judgment.value,
      overrides: {},
      now: new Date("2026-01-15T12:00:00.000Z"),
      timezone: "Europe/Dublin",
      collectionErrors: [],
      people: { alice: "Alice" },
    });
    expect(snapshot.features[0]?.stage).toBe("done");
  });
```

Place this inside the existing `describe("buildSnapshot", ...)` block, after the other `it(...)` cases there — it uses the same `rawFeatures`/`judgment` pattern already established in that block (read the block first to match the exact surrounding style).

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/merge.test.ts`
Expected: FAIL — `buildSnapshot` doesn't read `raw.signedOff` yet, so stage is computed from score/shipped bands alone (`"underway"` in, `"underway"` out — `deriveStage` never even sees a `todo` story overridden).

- [ ] **Step 4: Update `buildSnapshot`**

In `scripts/merge.ts`, find:

```ts
    const allShippedToDefault = raw.stories.length > 0 && raw.stories.every((s) => s.status === "shipped");
    const stage = deriveStage(effectiveScore, allShippedToDefault);
```

Replace with:

```ts
    const allShippedToDefault = raw.stories.length > 0 && raw.stories.every((s) => s.status === "shipped");
    const stage = deriveStage(effectiveScore, allShippedToDefault, raw.signedOff);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/merge.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add scripts/merge.ts tests/merge.test.ts
git commit -m "feat: honor signedOff when merge.ts recomputes feature stage"
```

---

### Task 4: `nav.ts` selector for signed-off-but-unverified stories

**Files:**
- Modify: `src/lib/dashboard/nav.ts`
- Test: `tests/dashboard/nav.test.ts` (new file — `nav.ts` has no dedicated test file today; this selector has real decision logic worth locking in, unlike the file's existing pure pass-through aggregations)

**Interfaces:**
- Produces: `signedOffUnverifiedStories(snapshot: StatusSnapshotT): { feature: FeatureT; story: StoryT }[]`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard/nav.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signedOffUnverifiedStories } from "../../src/lib/dashboard/nav.ts";
import { StatusSnapshot } from "../../src/lib/schema.ts";

const FIXTURES = new URL("./fixtures/snapshots/", import.meta.url);

function loadFixture(name: string) {
  return StatusSnapshot.parse(JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")));
}

describe("signedOffUnverifiedStories", () => {
  it("returns [] when no feature is stage done_unverified-and-done", () => {
    const snapshot = loadFixture("2026-08-10.json");
    expect(signedOffUnverifiedStories(snapshot)).toEqual([]);
  });

  it("collects done_unverified stories only from features whose stage is done", () => {
    // Build a minimal snapshot in-memory: one feature stage "done" with a
    // done_unverified story (should be included), one feature stage
    // "nearly_done" with a done_unverified story (should NOT be included,
    // since only sign-off can produce "done" alongside done_unverified —
    // this fixture directly tests the filter, independent of how stage
    // was derived).
    const base = loadFixture("2026-08-11.json");
    const snapshot = {
      ...base,
      features: [
        {
          ...base.features[0]!,
          stage: "done" as const,
          stories: [
            { ...base.features[0]!.stories[0]!, key: "SIGNED-1", status: "done_unverified" as const },
          ],
        },
        {
          ...base.features[1]!,
          stage: "nearly_done" as const,
          stories: [
            { ...base.features[1]!.stories[0]!, key: "UNSIGNED-1", status: "done_unverified" as const },
          ],
        },
      ],
    };
    const result = signedOffUnverifiedStories(snapshot);
    expect(result).toHaveLength(1);
    expect(result[0]?.story.key).toBe("SIGNED-1");
    expect(result[0]?.feature.key).toBe(base.features[0]!.key);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/dashboard/nav.test.ts`
Expected: FAIL — `signedOffUnverifiedStories` doesn't exist yet (import error / test file fails to run).

- [ ] **Step 3: Add the selector**

In `src/lib/dashboard/nav.ts`, add near `attentionFeatures`/`attentionReasons` (same general area — read that part of the file first to match its doc-comment style):

```ts
/** done_unverified stories that only read as fine because their feature
 *  was signed off by product (see src/lib/score.ts's deriveStage) — a
 *  feature can only reach stage "done" with a done_unverified story still
 *  in it via that override; the ordinary "done" path requires every story
 *  literally shipped. Surfaced separately, collapsed by default, so
 *  they're checkable without being a per-run distraction. */
export function signedOffUnverifiedStories(snapshot: StatusSnapshotT): { feature: FeatureT; story: StoryT }[] {
  return snapshot.features
    .filter((f) => f.stage === "done")
    .flatMap((feature) =>
      feature.stories.filter((story) => story.status === "done_unverified").map((story) => ({ feature, story })),
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/dashboard/nav.test.ts`
Expected: PASS — both tests.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/nav.ts tests/dashboard/nav.test.ts
git commit -m "feat: add signedOffUnverifiedStories selector for the attention page"
```

---

### Task 5: Needs Attention page — new section + Reviews-page-style card header

**Files:**
- Modify: `src/components/dashboard/pages/AttentionPage.tsx`

**Interfaces:**
- Consumes: `signedOffUnverifiedStories(snapshot)` (Task 4).

- [ ] **Step 1: Restyle the card header to match `ReviewsPage.tsx`'s `ReviewGroupCard` link/icon pattern**

In `src/components/dashboard/pages/AttentionPage.tsx`, find:

```tsx
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* feature.title already starts with the code ("F1.1 — ..."), so
            there's no separate code label here — just the one link. */}
        <ShellLink page="feature" code={featureSlug(feature.code)} className="text-[14.5px] font-medium">
          {feature.title}
        </ShellLink>
        {/* Icon-only: the title above is already the internal link to this
            feature's page, and nesting a second full anchor inside it
            isn't valid HTML. */}
        <JiraLink issueKey={feature.key} type="feature" tone={feature.stage} />
        <StatusPill status={feature.stage} className="shrink-0" />
        <OwnerLabel name={feature.owner} className="ml-auto text-xs text-muted-foreground" />
      </div>
```

Replace with:

```tsx
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* JiraLink wraps the primary title (icon + text, external Jira
            link) — same pattern as ReviewsPage's ReviewGroupCard header,
            rather than an internal ShellLink title with a bare icon
            alongside it. feature.title already starts with the code
            ("F1.1 — ..."), so there's no separate code label here. */}
        <JiraLink issueKey={feature.key} type="feature" tone={feature.stage} className="gap-1.5 text-[14.5px] font-medium">
          {feature.title}
        </JiraLink>
        <StatusPill status={feature.stage} className="shrink-0" />
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* The internal link to this app's own feature page, shown as
              the ticket key (not the code, which is already in the title
              above) — mirrors ReviewsPage's secondary ShellLink and
              FeatureCard's CardTitleRow, which both show the key
              separately from an already-coded title. */}
          <ShellLink
            page="feature"
            code={featureSlug(feature.code)}
            className="hover-fill font-mono-data text-xs text-muted-foreground no-underline"
          >
            {feature.key}
          </ShellLink>
          <OwnerLabel name={feature.owner} className="text-xs text-muted-foreground" />
        </div>
      </div>
```

Note this drops the old `ml-auto` from `OwnerLabel` itself (it's now inside the flex container that carries `ml-auto`) — don't leave a duplicate `ml-auto` on both.

- [ ] **Step 2: Verify in the browser**

Load the dev server, navigate to `/attention`, confirm existing flagged-feature cards still render correctly: title is now the Jira-icon+text link, feature key shows on the right before the owner, status pill unchanged, reasons list unchanged. Confirm no console errors.

- [ ] **Step 3: Add the new collapsed section**

Find:

```tsx
      {features.length === 0 ? (
        <EmptyState message="Nothing needs attention in this snapshot." />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading note={`${features.length} of ${snapshot.features.length} features`}>Flagged</SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {features.map((feature) => (
              <AttentionCard key={feature.key} feature={feature} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

Replace with:

```tsx
      {features.length === 0 ? (
        <EmptyState message="Nothing needs attention in this snapshot." />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading note={`${features.length} of ${snapshot.features.length} features`}>Flagged</SectionHeading>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {features.map((feature) => (
              <AttentionCard key={feature.key} feature={feature} now={now} />
            ))}
          </ul>
        </section>
      )}

      <SignedOffUnverifiedSection snapshot={snapshot} />
    </div>
  )
}

/**
 * done_unverified stories under a feature that's stage "done" only because
 * product signed off — collapsed by default. These are exactly the stories
 * a reader would otherwise have to go hunting for on a per-feature basis;
 * this section exists so "just in case" checking doesn't require opening
 * every signed-off feature one at a time, without making them a per-run
 * distraction the way the Flagged section above is.
 */
function SignedOffUnverifiedSection({ snapshot }: { snapshot: ReturnType<typeof useShell>["snapshot"] }) {
  const items = signedOffUnverifiedStories(snapshot)
  if (items.length === 0) return null

  return (
    <details className="group flex flex-col gap-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90"
        />
        {items.length} done-unverified {items.length === 1 ? "story" : "stories"} on signed-off features
      </summary>
      <p className="m-0 mt-1 pl-5 text-xs leading-relaxed text-muted-foreground">
        These features are marked done because product signed off, but GitHub still can't confirm every story
        reached master. Worth a glance, not a per-run check.
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {items.map(({ feature, story }) => (
          <li
            key={story.key}
            className="surface flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-4xl border border-dashed border-border px-5 py-3.5"
          >
            <JiraLink issueKey={story.key} type="story" tone={story.status} className="gap-1.5 text-sm">
              <span className="min-w-0 truncate">{story.summary}</span>
            </JiraLink>
            <ShellLink
              page="feature"
              code={featureSlug(feature.code)}
              className="hover-fill ml-auto font-mono-data shrink-0 text-xs text-muted-foreground no-underline"
            >
              {feature.code}
            </ShellLink>
          </li>
        ))}
      </ul>
    </details>
  )
}
```

- [ ] **Step 4: Wire up the new imports**

Find the top of the file:

```tsx
import { CircleAlert, Clock, GitPullRequestArrow, OctagonX } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import { attentionFeatures, attentionReasons, featureSlug, type AttentionReason } from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatusPill } from "../StatusPill"
import { OwnerLabel } from "../OwnerLabel"
import { EmptyState } from "../EmptyState"
import { JiraLink } from "../JiraLink"
```

Replace with:

```tsx
import { ChevronRight, CircleAlert, Clock, GitPullRequestArrow, OctagonX } from "lucide-react"
import type { z } from "zod"
import type { Feature as FeatureSchema } from "@/lib/schema"
import {
  attentionFeatures,
  attentionReasons,
  featureSlug,
  signedOffUnverifiedStories,
  type AttentionReason,
} from "@/lib/dashboard/nav"
import { useShell } from "../shell/ShellContext"
import { ShellLink } from "../shell/ShellLink"
import { SectionHeading } from "../SectionHeading"
import { StatusPill } from "../StatusPill"
import { OwnerLabel } from "../OwnerLabel"
import { EmptyState } from "../EmptyState"
import { JiraLink } from "../JiraLink"
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Verify in the browser**

Load `/attention`. If the current real snapshot has no signed-off-done features with a `done_unverified` story yet, the new section won't render (returns `null`) — that's expected until Task 6 refreshes real data. Confirm no console errors and no layout regression either way.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/pages/AttentionPage.tsx
git commit -m "feat: restyle attention cards to match Reviews, add signed-off-unverified section"
```

---

### Task 6: Real-data verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and test suite**

Run: `pnpm build && pnpm test`
Expected: succeed with zero errors/failures beyond the pre-existing, unrelated `scroll-area.tsx`/`router.tsx` unused-import errors already known to predate all of this work.

- [ ] **Step 2: Re-run the real collection pipeline**

Run: `pnpm collect`

Then inspect: F1.1 (BOUN-11207) and F1.5 (BOUN-11211) were confirmed via a direct JIRA API check to have Product Sign Off = "Approved" while carrying `done_unverified` stories. Confirm both now report `signedOff: true` and `stage: "done"` in `data/raw/<today>.json`:

```bash
python3 -c "
import json, glob
path = sorted(glob.glob('data/raw/*.json'))[-1]
d = json.load(open(path))
for f in d['features']:
    if f['key'] in ('BOUN-11207', 'BOUN-11211'):
        print(f['key'], 'signedOff=', f['signedOff'], 'stage=', f['stage'], 'score=', f['score'])
"
```

Expected: both print `signedOff= True stage= done`.

- [ ] **Step 3: Run judge + merge, spot-check the rendered pages**

Follow the project's daily routine (judge skill, then `pnpm merge`) to produce a full snapshot. Start the dev server and confirm:
- F1.5's feature page shows a "Done" stage badge (not "Nearly done"), even though it still has `done_unverified` stories.
- M1 (the milestone containing F1.5) now shows stage "done" and collapses by default in both the Sidebar and the Today page's milestone groups — confirm this happens with NO code changes beyond Tasks 1-3 (it's meant to cascade for free through `milestoneProgress`'s existing `allDone` check).
- The Needs Attention page's new collapsed section appears, listing exactly the `done_unverified` stories under now-done, signed-off features (BOUN-11251/11273/11295/11303 under F1.5, if F1.5 is signed off, plus BOUN-11312/11313/11314 under F1.1 if F1.1 is signed off) — expand it and confirm each row links correctly (Jira icon+summary, feature code on the right).
- The restyled "Flagged" cards on the Needs Attention page render correctly (Task 5, Step 2's check, re-confirmed against real data).

- [ ] **Step 4: Report results**

Summarize which real features ended up signed-off-and-done, confirm the milestone cascade worked with zero additional code, and confirm no regressions in unrelated features/pages.

No commit for this task — it's verification of everything already committed in Tasks 1-5.
