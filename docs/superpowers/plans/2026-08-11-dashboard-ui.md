# WPP Status Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public-facing WPP at Scale status dashboard — a fully prerendered TanStack Start site reading `data/snapshots/*.json` at build time, rendering the page order and fields specified in the `/goal`, with a considered, disciplined visual system (not the reference mockup's literal styling).

**Architecture:** Two routes (`/` = latest snapshot, `/$date` = a specific one) both render one shared `DashboardPage` component built from a small design-system component library under `src/components/dashboard/`. All snapshot/history data is loaded via Vite's `import.meta.glob` (build-time ES module import, not `fs`, not a server function) so client-side navigation between prerendered pages still works via ordinary code-split dynamic imports. Pure data-shaping logic (filtering, staleness, since-last-snapshot diffing, Slack summary text, burn-up series) lives in testable modules under `src/lib/dashboard/`, separate from rendering.

**Tech Stack:** TanStack Start (Nitro, static prerendering), Tailwind v4 (CSS-native tokens, no `tailwind.config.js`), shadcn/ui on Base UI (`base-nova`/`neutral` preset, already scaffolded), Recharts, Zod (search-param validation), Vitest.

## Global Constraints

- `src/lib/schema.ts` is the contract. Never modify it. Every snapshot is `StatusSnapshot.parse()`-validated at load.
- No runtime fetch, no server functions for reading snapshot data — `import.meta.glob` only. The whole site must work as static prerendered HTML.
- `dataOk: false` on a feature → render "data unavailable" for that section, never a bare `0%`.
- `collectionErrors` on the snapshot → a visible notice, never swallowed.
- No callouts on a feature → say so explicitly ("No open callouts — nothing to flag."), never an empty gap.
- No previous snapshot available → omit deltas/since-last-snapshot entirely, never show a fabricated zero-delta.
- Never render: per-person velocity, PR bodies, verbatim AC text, file paths. This is a public site — everything rendered comes from `StatusSnapshot`, which is already publication-safe by construction (Phase 1's `merge.ts` guarantees this), but double-check nothing in this phase re-adds a raw/pending read.
- Status must be conveyed by text, never color alone. Every status pill/dot has a text label.
- Exactly one progress bar per feature card. No per-subtask/workstream bars.
- Responsive to 380px: no horizontal scroll anywhere, tables restack to cards.
- `"/"` keyboard shortcut focuses the text filter from anywhere on the page (except while already typing in a field).

## Design System (apply before any component work)

**Discipline:** color is reserved *entirely* for status semantics. All interface chrome — buttons, links, borders, focus rings, card surfaces — is achromatic (near-black/near-white grays). This is the thesis: the six status hues are the only color on the page, so they read as a deliberate, legible family instead of competing with brand/decoration color. This directly serves the goal's "family, not rainbow" requirement by giving color nowhere else to hide.

**Typography:** one type family used two ways — Geist Sans (`@fontsource-variable/geist`, already a dependency) for all prose/UI, Geist Mono (`@fontsource-variable/geist-mono`, add as a dependency) for anything that *is* data: ticket codes, PR refs, branch names, and — deliberately — the big score percentages and KPI numbers. Numbers-as-monospace-hero is the display treatment; there is no separate serif display face. This is chosen because the subject (git/JIRA artifacts, weighted scores) is itself monospace-native, not as an arbitrary two-typeface pairing.

**Signature element:** every score bar (`ScoreBar`) renders faint ruler-tick marks at 0/25/70/100 — the *actual* `Stage` boundaries from `src/lib/score.ts`'s `deriveStage`, not decorative gridlines. The bar teaches the stage system it's built from. This is the one deliberate risk; everything else stays quiet.

**Color tokens** (OKLCH, light + `.dark` class per shadcn convention already wired by `ThemeToggle.tsx`):

Chrome (achromatic, same hue-less family light/dark):
- `--background` / `--foreground`, `--card`, `--popover`, `--primary` (≈ foreground — ink, not brand color), `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring` — all `oklch(L C~0.005 90)`, varying only L between light/dark.
- `--destructive` reuses `--status-blocked` (see below) rather than inventing a 7th hue.

Status family (six hues, matched L/C so they sit together as a family, distinct hues so shipped vs. staged is unambiguous at a glance and under common color-vision deficiencies):
| token | light `oklch()` | dark `oklch()` | meaning |
|---|---|---|---|
| `--status-shipped` | `0.52 0.13 152` | `0.72 0.13 152` | green — merged to default branch |
| `--status-staged` | `0.50 0.15 235` | `0.72 0.13 235` | blue — merged, not to default |
| `--status-in-review` | `0.53 0.135 300` | `0.74 0.13 300` | violet |
| `--status-in-progress` | `0.60 0.15 70` | `0.78 0.14 70` | amber |
| `--status-blocked` | `0.55 0.19 25` | `0.70 0.17 25` | red |
| `--status-todo` | `0.62 0.012 90` | `0.62 0.015 90` | neutral gray |

`Stage` (5 values) reuses these same six hues rather than inventing more: `not_started`→todo gray, `early`/`underway`→in-progress amber (outline vs. filled), `nearly_done`→staged blue (deliberately *not* green — nearly done must never look done), `done`→shipped green.

Tinted pill backgrounds are computed, not hand-picked: `background: color-mix(in oklch, var(--status-X) 16%, var(--card))`, text: `color-mix(in oklch, var(--status-X) 78%, var(--foreground))`. One CSS rule, parameterized by a `data-status` attribute — no per-status one-off classes.

## File Structure

- `src/styles.css` — full rewrite: tokens above, `@custom-variant dark`, Geist Sans/Mono imports, ruler-tick keyframes/utility, remove the old teal/"sea" theme entirely.
- `src/routes/__root.tsx` — drop `<Header/>`/`<Footer/>` (dashboard renders its own header/footer per page order items 1 and 11); keep the theme-init script and `HeadContent`/`Scripts`.
- `src/routes/index.tsx` — loader: latest snapshot + previous + history; renders `<DashboardPage/>`.
- `src/routes/$date.tsx` — loader: snapshot for `params.date` (`notFound()` if missing) + previous + history; same render.
- Delete: `src/routes/about.tsx`, `src/routes/demo/`, `src/components/Header.tsx`, `src/components/Footer.tsx` (unused starter boilerplate; their only live content — the theme toggle — moves into `DashboardHeader`).
- `src/lib/dashboard/snapshots.ts` — `import.meta.glob` loader: `listSnapshotDates()`, `loadSnapshot(date)`, `loadLatestSnapshot()`, `loadHistory()` (date+kpis+generatedAt for every snapshot, for the burn-up chart).
- `src/lib/dashboard/search.ts` — the shared `validateSearch` zod schema + `DashboardSearch` type + `matchesFilters(feature, search, engineers)` pure predicate.
- `src/lib/dashboard/staleness.ts` — `isStale(generatedAt, now)` (>26h).
- `src/lib/dashboard/diff.ts` — `computeChanges(current, previous): ChangeItem[]` (shipped/newly-staged/newly-blocked/newly-stalled).
- `src/lib/dashboard/slack.ts` — `buildSlackSummary(snapshot): string` (Slack mrkdwn).
- `src/lib/dashboard/burnup.ts` — `buildBurnUpSeries(history, targetDate): Point[]` + pace-line calc.
- `src/lib/dashboard/anchors.ts` — `featureAnchorId(code)` (`"F1.1"` → `"f1-1"`), `useScrollToHash()` hook.
- `src/components/dashboard/StatusPill.tsx`, `ScoreBar.tsx`, `KpiStat.tsx`, `FeatureCard.tsx`, `Callout.tsx`, `EmptyState.tsx`, `OverrideNote.tsx`, `AcCoverageSummary.tsx`, `ReleaseGateLine.tsx`, `SubtaskTable.tsx`, `ChangeFeedItem.tsx`, `FilterBar.tsx`, `DashboardHeader.tsx`, `StaleBanner.tsx`, `ReviewQueueTable.tsx`, `SubtaskStatusMixChart.tsx`, `BurnUpChart.tsx`, `MethodologyFooter.tsx`, `DashboardPage.tsx`.
- `tests/dashboard/search.test.ts`, `staleness.test.ts`, `diff.test.ts`, `slack.test.ts`, `burnup.test.ts`, `anchors.test.ts`.
- `vite.config.ts` — add `prerender: { enabled: true, crawlLinks: true }` and an explicit `pages` list (every `/${date}` from `data/snapshots/`, computed via sync `fs.readdirSync` at config-eval time — config files run in Node, this is not a runtime fetch).
- `package.json` — add `recharts`, `@fontsource-variable/geist-mono`.

## Interfaces (locked across tasks)

```ts
// src/lib/dashboard/snapshots.ts
function listSnapshotDates(): string[];                       // sorted ascending "YYYY-MM-DD"
function loadSnapshot(date: string): Promise<StatusSnapshot | null>;
function loadLatestSnapshot(): Promise<StatusSnapshot>;        // throws if none exist
type HistoryPoint = { date: string; generatedAt: string; kpis: StatusSnapshot["kpis"] };
function loadHistory(): Promise<HistoryPoint[]>;                // ascending by date

// src/lib/dashboard/search.ts
type DashboardSearch = {
  milestone: "all" | "m1" | "m3-m4";
  engineer: string | null;   // a display name from Feature.owner, or null = all
  needsAttention: boolean;
  q: string;
};
const dashboardSearchSchema: z.ZodType<DashboardSearch>;
function matchesFilters(feature: Feature, search: DashboardSearch): boolean;
function needsAttention(feature: Feature): boolean;             // blocked>0 | stalled>7d | review>2d | callouts.length>0

// src/lib/dashboard/staleness.ts
function isStale(generatedAt: string, now: Date): boolean;      // > 26h

// src/lib/dashboard/diff.ts
type ChangeItem =
  | { kind: "shipped"; feature: Feature; subtask: Subtask; pr: PrRef; scoreDelta: number }
  | { kind: "newly_staged"; feature: Feature; subtask: Subtask; integrationBranch: string }
  | { kind: "newly_blocked"; feature: Feature; subtask: Subtask }
  | { kind: "newly_stalled"; feature: Feature; daysSinceLastActivity: number };
function computeChanges(current: StatusSnapshot, previous: StatusSnapshot | null): ChangeItem[];

// src/lib/dashboard/slack.ts
function buildSlackSummary(snapshot: StatusSnapshot): string;   // Slack mrkdwn, no tables

// src/lib/dashboard/burnup.ts
type BurnUpPoint = { date: string; shipped: number; staged: number; total: number; pace: number | null };
function buildBurnUpSeries(history: HistoryPoint[], startDate: string, targetDate: string | null): BurnUpPoint[];

// src/lib/dashboard/anchors.ts
function featureAnchorId(code: string): string;                 // "F1.1" -> "f1-1", "M3" -> "m3"
function useScrollToHash(): void;                                // effect, scrolls matching id on mount/hash change

// src/components/dashboard/StatusPill.tsx
type StatusPillProps = { status: SubtaskStatus | Stage; label?: string };  // label defaults to a humanized status name
// src/components/dashboard/ScoreBar.tsx
type ScoreBarProps = { score: number; allShippedToDefault: boolean };
// src/components/dashboard/FeatureCard.tsx
type FeatureCardProps = { feature: Feature; previousFeature: Feature | null; peopleTier: "full" | "light" };
```

## Task List

### Task 1: Dependencies + design tokens (`styles.css`)
**Files:** Modify `package.json`, `src/styles.css`.
- [ ] `pnpm add recharts @fontsource-variable/geist-mono`.
- [ ] Rewrite `src/styles.css`: drop the `Fraunces`/`Manrope` Google Fonts `@import` and the `--sea-*`/`--lagoon`/`--palm` theme; add `@import "@fontsource-variable/geist"`, `@import "@fontsource-variable/geist-mono"`; add `@custom-variant dark (&:is(.dark *))`; define the achromatic chrome tokens and six `--status-*` tokens (light in `:root`, dark in `.dark`) exactly as in the Design System section above; add a `.tick-marks` utility (see `ScoreBar` in Task 4) and a `.font-mono-data` utility (`font-family: var(--font-mono); font-variant-numeric: tabular-nums;`).
- [ ] Verify: `pnpm build` compiles with no Tailwind/CSS errors (component work hasn't started yet, so this just checks the token file parses).
- [ ] Commit: `feat: rewrite design tokens for the status dashboard`.

### Task 2: Strip starter boilerplate
**Files:** Delete `src/routes/about.tsx`, `src/routes/demo/tanstack-query.tsx` (and the now-empty `demo/` dir), `src/components/Header.tsx`, `src/components/Footer.tsx`. Modify `src/routes/__root.tsx`.
- [ ] Delete the four files/dirs above.
- [ ] In `__root.tsx`: remove the `Header`/`Footer` imports and their JSX usage from `RootDocument`; leave `THEME_INIT_SCRIPT`, `HeadContent`, `Scripts`, `TanStackDevtools` untouched.
- [ ] `pnpm run generate-routes` (regenerates `routeTree.gen.ts` without the deleted routes).
- [ ] Run `pnpm test` — unaffected, still green (no route-level tests exist yet).
- [ ] Commit: `chore: remove starter boilerplate routes and site chrome`.

### Task 3: `snapshots.ts` loader
**Files:** Create `src/lib/dashboard/snapshots.ts`, `tests/dashboard/snapshots.test.ts`, `tests/dashboard/fixtures/snapshots/2026-08-10.json`, `.../2026-08-11.json` (two small hand-built valid `StatusSnapshot` fixtures, consecutive dates, used by this test and reused by Task 6/8's diff/burnup tests).
- [ ] Write the two fixture snapshots: same 2 features, second date has one subtask flip from `staged`→`shipped` (score +5), and `generatedAt` 24h apart. Keep them minimal but schema-valid (`StatusSnapshot.parse()` must accept them — write a quick throwaway script check, not a permanent test, to confirm before moving on).
- [ ] Failing test: `listSnapshotDates()` against a glob of the two fixtures returns `["2026-08-10", "2026-08-11"]` sorted ascending. Since `import.meta.glob` reads real files at the real path, point the test at the *real* `data/snapshots/` fixture set instead of the two hand-built ones for this specific test (mocking `import.meta.glob` isn't practical) — assert the real directory's dates are returned sorted, `2026-08-11` included.
- [ ] Implement `listSnapshotDates`/`loadSnapshot`/`loadLatestSnapshot`/`loadHistory` using a lazy (non-`eager`) `import.meta.glob("../../../data/snapshots/*.json")`, `StatusSnapshot.parse()` on every loaded module's default export.
- [ ] Failing test: `loadSnapshot("2026-08-11")` against the real data returns a snapshot whose `.date === "2026-08-11"`; `loadSnapshot("1999-01-01")` returns `null`.
- [ ] Failing test: `loadHistory()` returns points sorted ascending by date, each with `kpis` present.
- [ ] Run tests, pass. Commit: `feat: add build-time snapshot loader (import.meta.glob)`.

### Task 4: Design-system primitives — `StatusPill`, `ScoreBar`, `KpiStat`, `EmptyState`, `Callout`
**Files:** Create the five components under `src/components/dashboard/`, plus `src/lib/dashboard/statusLabels.ts` (humanized labels: `shipped`→"Shipped", `in_review`→"In review", etc., and `Stage`→color-token mapping per the Design System table).
- [ ] `StatusPill`: renders `<span data-status={status} class="status-pill">● {label}</span>` — the dot is `aria-hidden`, the text label is always present (never color-only). `data-status` drives the `color-mix()` CSS rule in `styles.css` (added in this task): one rule, `[data-status] { background: color-mix(...); color: color-mix(...); }`, reading `--status-{status-with-dashes}` — write the small kebab-case mapping (`in_review` → `in-review`) in `statusLabels.ts`.
- [ ] `ScoreBar`: a single filled bar (`--status-shipped` if `allShippedToDefault`, else a neutral achromatic fill — the bar's own fill is *not* status-colored per feature card, since the score is a blended number, not one status; color stays reserved for the stacked chart and pills) with ruler ticks at 0/25/70/100 (absolute-positioned 1px marks, `.tick-marks` utility) and the score number in `font-mono-data` beside it.
- [ ] `KpiStat`: label + big `font-mono-data` number + optional sub-label (e.g. "+2 light-tier").
- [ ] `EmptyState`: icon slot (optional) + message, one visual treatment reused everywhere ("nothing here" is never styled as an error).
- [ ] `Callout`: `severity: "info"|"warn"|"risk"` (maps to achromatic/amber/red border-left treatment, text carries the meaning), `type` shown as a small kebab-case label, `message`, optional `refs` list.
- [ ] Visual check: render all five in a throwaway spot in `index.tsx` temporarily, `pnpm dev`, screenshot via the browser tool at desktop and 380px width, confirm ruler ticks are visible and pills read clearly in both themes (toggle via `ThemeToggle`). Remove the throwaway usage before moving on.
- [ ] Commit: `feat: add status pill, score bar, KPI stat, empty state, callout primitives`.

### Task 5: `search.ts` filtering logic
**Files:** Create `src/lib/dashboard/search.ts`, `tests/dashboard/search.test.ts`.
- [ ] Failing tests: `needsAttention(feature)` is true when `scoreBasis.blocked > 0`, when `daysSinceLastActivity > 7` AND stage isn't `done`, when any subtask has been open for review... (review-waiting is PR-level, not on `Feature` directly — derive it as: any subtask's PR is `OPEN` and `daysSinceLastActivity` on that subtask's feature suggests waiting; keep the heuristic simple and documented: `blocked>0 || (stage!=="done" && daysSinceLastActivity!=null && daysSinceLastActivity>7) || callouts.length>0`) and false for a healthy, recently-active, callout-free feature.
- [ ] Failing tests: `matchesFilters` — milestone `"m1"` matches only `feature.milestone==="M1"`, `"m3-m4"` matches `M3`/`M4`; `engineer` matches `feature.owner` exactly (case-sensitive display name) or passes everything when `null`; `needsAttention:true` filters to `needsAttention(feature)`; `q` matches case-insensitively against `feature.title`, `feature.code`, and `feature.key`; all filters AND together.
- [ ] Implement `needsAttention` and `matchesFilters`; implement `dashboardSearchSchema` with zod (`milestone` enum `.default("all").catch("all")`, `engineer` `z.string().nullable().default(null)`, `needsAttention` `z.boolean().default(false)`, `q` `z.string().default("")`) per the search-params `.default().catch()` pattern (no `@tanstack/zod-adapter` needed — passing the raw schema directly to `validateSearch` keeps type inference).
- [ ] Run tests, pass. Commit: `feat: add dashboard filter predicate and search schema`.

### Task 6: `staleness.ts` and `diff.ts`
**Files:** Create `src/lib/dashboard/staleness.ts`, `diff.ts`, `tests/dashboard/staleness.test.ts`, `tests/dashboard/diff.test.ts`.
- [ ] Failing tests: `isStale` true at exactly 26h+1min old, false at 25h59m, using fixed `Date` instants (no `Date.now()` inside the function — take `now` as a parameter, matching the `logicalDate(timezone, now)` pattern from Phase 1's `config.ts`).
- [ ] Failing tests for `computeChanges` using the two fixture snapshots from Task 3: the subtask that flipped `staged`→`shipped` produces exactly one `{kind:"shipped", ...}` item with the right `scoreDelta`; a subtask that flipped to `blocked` produces `newly_blocked`; a feature whose `daysSinceLastActivity` crossed a stall threshold (define: >14 days, matching the mockup's "stalled" framing, and only fire once — the day it *crosses*, not every subsequent day: compare `previous`'s days-since-activity, which will be ~1 day less, to detect the crossing) produces `newly_stalled`; `computeChanges(current, null)` returns `[]` (never fabricate deltas with no prior snapshot).
- [ ] Implement both. `computeChanges` diffs `current.features[].subtasks[]` against `previous.features[].subtasks[]` by `key`.
- [ ] Run tests, pass. Commit: `feat: add staleness check and since-last-snapshot diff`.

### Task 7: `slack.ts`
**Files:** Create `src/lib/dashboard/slack.ts`, `tests/dashboard/slack.test.ts`.
- [ ] Failing tests: output contains the headline sentence bolded (`*...*`), a KPI line, never contains a markdown table (`|` pipe-table syntax) or a markdown heading (`#`), uses `•` for bullets, includes a bullet per feature with `code`, `stage`, `score`, and (only if `needsAttention`) a "needs attention" marker — build this from a fixture `StatusSnapshot`.
- [ ] Implement `buildSlackSummary` using only Slack mrkdwn (`*bold*`, `_italic_`, `` `code` ``, `<url|text>` links, `•`/`-` bullets — never `**`, never `|table|`, never `#heading`).
- [ ] Run tests, pass. Commit: `feat: add Slack mrkdwn summary builder`.

### Task 8: `burnup.ts` and `anchors.ts`
**Files:** Create `src/lib/dashboard/burnup.ts`, `anchors.ts`, `tests/dashboard/burnup.test.ts`, `tests/dashboard/anchors.test.ts`.
- [ ] Failing tests: `buildBurnUpSeries` with the two-point fixture history returns two points with correct `shipped`/`staged`/`total` (`= shipped+staged+inReview+blockedOrTodo`, from `kpis`); with a `targetDate`, `pace` is a straight-line interpolation from `(startDate, 0)` to `(targetDate, total)` evaluated at each point's date — with no `targetDate`, every point's `pace` is `null`.
- [ ] Failing tests: `featureAnchorId("F1.1")==="f1-1"`, `featureAnchorId("DF4.1.1")==="df4-1-1"`, `featureAnchorId("M3")==="m3"`.
- [ ] Implement both (pure functions; `useScrollToHash` is a React effect, not unit-tested here — verified visually in Task 13).
- [ ] Run tests, pass. Commit: `feat: add burn-up series builder and anchor-id helper`.

### Task 9: `FeatureCard`, `SubtaskTable`, `AcCoverageSummary`, `ReleaseGateLine`, `OverrideNote`
**Files:** Create the five components under `src/components/dashboard/`.
- [ ] `SubtaskTable`: real `<table>` (ticket / summary / status pill / PR link) for accessibility; below the `sm` breakpoint each `<tr>` becomes a `display:block` card via CSS with `data-label` attrs feeding `::before` content — no horizontal scroll at 380px. PR link renders `repo#number` in `font-mono-data`, linking to `pr.url`.
- [ ] `AcCoverageSummary`: "7/9 covered · 1 partial · 1 no signal" computed from `feature.acCoverage`, each count in `font-mono-data`.
- [ ] `ReleaseGateLine`: renders `releaseGate.status` (open/merged/not_found) with the integration branch name in `font-mono-data`; `null` releaseGate → nothing rendered (not an empty state — a feature with no staged work simply has no gate line).
- [ ] `OverrideNote`: visually distinct (left border + slightly different surface, an explicit "Note from {author}" line) from every generated/computed section on the card — this must not look machine-generated. Shows `note`, `author`, and (if past today) nothing — Task 11's data layer already drops expired overrides before they reach the page, so this component trusts what it's given.
- [ ] `FeatureCard` (full-tier): composes `StatusPill` (stage) + blocked-count badge if `scoreBasis.blocked>0` + `ScoreBar` + delta vs. previous (`previousFeature` prop; omit the whole delta line if `null`, never show "+0") + `rationale` (styled by `confidence` — e.g. a small confidence tag, not a color swap) + `callouts.map(Callout)` or `EmptyState` if empty + `daysSinceLastActivity`/`daysInStaged` stats + `AcCoverageSummary` + `ReleaseGateLine` + collapsible `SubtaskTable` (native `<details>`/`<summary>`, no JS needed) + `OverrideNote` if present. `dataOk===false` short-circuits the whole body to an `EmptyState` reading "Data unavailable for this feature" — never a `0%` score bar.
- [ ] Add a `tier: "full" | "light"` prop: `"light"` renders a condensed variant — same fields, single-owner framing (per goal item 7 "same fields, condensed, single owner"), smaller type scale, no separate per-milestone owner line since M3/M4 already share Tony as the one owner.
- [ ] Visual check: render one full-tier and one light-tier card with realistic data (pull straight from `data/snapshots/2026-08-11.json`) at desktop and 380px, both themes.
- [ ] Commit: `feat: add feature card and its subcomponents`.

### Task 10: `FilterBar`, `DashboardHeader`, `StaleBanner`, `ChangeFeedItem`
**Files:** Create the four components. Modify `src/components/ThemeToggle.tsx` (restyle only — swap the hardcoded `--chip-*`/`--sea-ink` classes for the new tokens; no behavior change).
- [ ] `FilterBar`: sticky (`sticky top-0` with a backdrop blur, offset below `DashboardHeader` if that's also sticky — decide one sticky header, not two: make `DashboardHeader` scroll normally and only `FilterBar` sticky, per goal item 5 "Filters, sticky" — item 1 doesn't ask for a sticky header). Milestone as a shadcn `ToggleGroup` (All/M1/M3-M4), engineer as a shadcn `Select` populated from the *distinct owners present in this snapshot* (not a hardcoded list), needs-attention as a shadcn `Switch`, text filter as a shadcn `Input` with a ref wired to the global `"/"` keydown handler (ignore the shortcut while any input/textarea/select already has focus). All four read/write `Route.useSearch()`/`useNavigate` — no local state duplicating URL state.
- [ ] `DashboardHeader`: epic name + snapshot date + target date (or "no target date set" — never blank) + `ThemeToggle` + a "Copy Slack summary" button (`navigator.clipboard.writeText(buildSlackSummary(snapshot))`, with a brief "Copied" confirmation state — no toast library, a 2s text swap on the button itself is enough) + a `StaleBanner` slot.
- [ ] `StaleBanner`: renders only when `isStale(generatedAt, now)` — `now` passed in as a prop from the page (not `new Date()` inside the component, so it's testable/SSR-safe); a `Callout severity="risk"` reading e.g. "This snapshot is over 26 hours old — data may be out of date." with the exact age.
- [ ] `ChangeFeedItem`: one visual per `ChangeItem` kind (Task 6), each reusing `StatusPill`/`font-mono-data` for ticket/PR refs, matching the mockup's information density (what shipped, which PR, whose feature, the score delta) without copying its exact styling.
- [ ] Visual check both themes + 380px, focus the text filter with `/` and confirm it doesn't fire while another input is focused.
- [ ] Commit: `feat: add filter bar, dashboard header, stale banner, change feed item`.

### Task 11: `DashboardPage` composition + routes
**Files:** Create `src/components/dashboard/DashboardPage.tsx`. Create `src/routes/index.tsx` (rewrite), `src/routes/$date.tsx` (new). Create `src/lib/dashboard/overrides.ts` (tiny: `isOverrideExpired` reuse — actually `merge.ts` already drops expired overrides before writing the snapshot, so no expiry logic is needed client-side; skip this file, note it in the component instead).
- [ ] `DashboardPage` props: `{ snapshot, previous, history, search }`. Renders, in order: `DashboardHeader` (+ `StaleBanner`) → headline sentence (largest text on the page — bigger than any KPI number, bigger than section headers; a collectionErrors notice directly under it if `collectionErrors.length>0`) → since-last-snapshot feed (`computeChanges`, `ChangeFeedItem[]` or an explicit `EmptyState` "Nothing changed since {label}" — the label names the actual gap, e.g. "since Friday" computed from `previous.date` vs `current.date` weekday difference, not a hardcoded word) → KPI row (six `KpiStat`s from `snapshot.kpis`, `featuresTracked` sublabel `"+{lightTierMilestones} light-tier"`) → `FilterBar` → M1 full-tier `FeatureCard`s (filtered by `matchesFilters`, each wrapped in a `<section id={featureAnchorId(code)}>`) → M3/M4 light-tier cards in one `<section id="m3-m4">` → `SubtaskStatusMixChart` → `BurnUpChart` → `ReviewQueueTable` → `MethodologyFooter`.
- [ ] Call `useScrollToHash()` once at the top of `DashboardPage`.
- [ ] `src/routes/index.tsx`: `validateSearch: dashboardSearchSchema`, `loader` calls `loadLatestSnapshot()` + `loadHistory()` + (look up the snapshot immediately before the latest date, if any, for `previous`), `head()` sets title/description/OG tags from `loaderData.snapshot.headline.sentence` (per the deployment skill's dynamic-meta-from-loader pattern) so Slack unfurls the headline. Renders `<DashboardPage/>`.
- [ ] `src/routes/$date.tsx`: same, but `loadSnapshot(params.date)`, `throw notFound()` if `null`, `notFoundComponent` reading "No snapshot for {date}." with a link back to `/`. `previous` = the snapshot for the date immediately before `params.date` in `listSnapshotDates()`, if any.
- [ ] `pnpm run generate-routes`, `pnpm dev`, manually visit `/` and `/2026-08-11` — confirm both render, confirm an unknown date 404s.
- [ ] Commit: `feat: compose the dashboard page and wire up routes`.

### Task 12: `SubtaskStatusMixChart`, `BurnUpChart`, `ReviewQueueTable`, `MethodologyFooter`
**Files:** Create the four components.
- [ ] `SubtaskStatusMixChart`: Recharts `BarChart`, one bar per feature (`code` on the X axis, 7 bars: F1.1–F1.5, M3, M4), six stacked `Bar`s (`stackId="status"`) filled with `var(--status-*)`, legend below using `StatusPill`-style swatches (not Recharts' default legend, for consistent theming), tooltip disabled or minimal (no per-person data in it). Shipped and staged rendered as visibly separate stack segments — never pre-summed before charting.
- [ ] `BurnUpChart`: Recharts `AreaChart` or `ComposedChart` — `shipped` and `staged` as stacked areas (`--status-shipped`/`--status-staged`), `total` as a thin reference line, the pace line as a dashed achromatic line (`buildBurnUpSeries`'s `pace` field), X axis = snapshot dates, Y axis = subtask count. Renders an `EmptyState` ("Not enough history yet — check back after a couple of weeks of snapshots.") instead of the chart when `history.length < 10` (≈2 weeks of weekday snapshots) rather than a chart with one or two points.
- [ ] `ReviewQueueTable`: same responsive table treatment as `SubtaskTable`, sorted by `ageDays` descending, columns PR link / feature / reviewer / age; `EmptyState` "Nothing waiting on review." when empty.
- [ ] `MethodologyFooter`: the shipped-vs-staged explanation and the two-tier (full/light) explanation as fixed copy (not derived from data — it's methodology, it doesn't change per snapshot), plus "Sources: JIRA {epic.key} · GitHub" and `generatedAt` in `font-mono-data`.
- [ ] Wire all four into `DashboardPage` (Task 11 already listed their slots — if Task 11 was done first, this task fills in the placeholders).
- [ ] Visual check both charts render sensibly against the real `2026-08-11.json` data (which only has one snapshot — confirm `BurnUpChart` correctly shows its empty state, not a broken one-point chart).
- [ ] Commit: `feat: add subtask mix chart, burn-up chart, review queue, methodology footer`.

### Task 13: Responsive + accessibility + OG pass
**Files:** No new files expected; touch-up edits across `src/components/dashboard/*` and `src/styles.css` as issues are found.
- [ ] `pnpm dev`, use the browser tool at 380×800 (phone-from-Slack-link) and confirm: headline, since-last-snapshot feed, and filters all work with no horizontal scroll; every table has restacked to cards; the `"/"` shortcut still focuses the filter.
- [ ] Confirm every interactive element has a visible focus ring (the achromatic `--ring` token) by tabbing through the page.
- [ ] Confirm dark mode via `ThemeToggle` at both viewport sizes — status colors still read clearly against `.dark` backgrounds.
- [ ] Confirm `<title>`/OG meta render the actual headline sentence — view source or check `head()` output for both `/` and a `/$date` route.
- [ ] Run the full `pnpm test` suite and `pnpm build` (which runs the prerender step) — confirm the build emits static HTML for `/` and every snapshot date with no errors.
- [ ] No commit-worthy code change expected unless a real bug is found; if so, commit as `fix: ...` with what was found.

## Self-Review Notes

- Page order 1–11 from the goal maps 1:1 onto `DashboardPage`'s render order in Task 11.
- MUST NOT SHOW list verified structurally: `StatusSnapshot` (Phase 1's output) has no PR bodies/verbatim AC/file paths/per-person velocity fields at all — nothing in this phase reads `data/raw` or `data/pending`, so there is no code path that *could* leak them.
- STATES section (dataOk/collectionErrors/no-callouts/no-previous) each has an explicit task-9/11 handling note above — none silently render a zero or blank.
- Type consistency: `ChangeItem`, `DashboardSearch`, `HistoryPoint`, `BurnUpPoint` defined once in Task 3/5/6/8 and reused verbatim in Tasks 9–12; no redefinition drift.
