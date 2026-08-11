# Data Collection Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a config-driven data collection pipeline (`pnpm collect` → judge routine → `pnpm merge`) that pulls JIRA + GitHub data for a configured epic, derives a deterministic status snapshot, and applies an untrusted judgment layer, writing publication-safe JSON to `data/snapshots/`.

**Architecture:** Two CLI scripts (`scripts/collect.ts`, `scripts/merge.ts`) run via `tsx`, backed by pure logic modules (`classify.ts`, `score.ts`, `adf.ts`) that are fully unit-testable without network, and I/O modules (`jira.ts`, `github.ts`, `config.ts`) that talk to real APIs. `src/lib/schema.ts` (given, not modified) is the contract for the final snapshot and the judgment file. The judgment step is *not* code — it's a Claude Code routine (`.claude/skills/judge/SKILL.md`) that reads `data/pending/<date>.json` and writes `data/judgment/<date>.json`; `merge.ts` treats that file as untrusted input and validates it strictly.

**Tech Stack:** TypeScript strict, zod, `yaml`, Octokit (`@octokit/graphql` + `@octokit/rest` only for typed GraphQL if needed), native `fetch` for JIRA REST, vitest, tsx, pnpm, Node 20+ (repo has Node 24 installed).

## Global Constraints

- `src/lib/schema.ts` is the contract. Never modify it.
- Nothing project-specific (epic key, company, engineer names, repo names) is hardcoded in `src/`, `scripts/`, or `.claude/skills/judge/SKILL.md`. All of it comes from `config.yaml` / `overrides.yaml`.
- `shipped = state MERGED && baseRefName === repo default branch`. `staged = state MERGED && baseRefName !== default branch`. Never collapsed, anywhere.
- No `ANTHROPIC_API_KEY`, no programmatic model call, anywhere in this codebase.
- Never log or write a token/secret to any output file.
- All dates are logical dates in `config.timezone`, computed via a single `logicalDate()` helper — never `new Date().toISOString().slice(0,10)` (that's UTC, not the configured zone).
- Snapshots (`data/snapshots/*.json`) are publication-safe: no PR bodies, no verbatim AC text, no file paths, no per-person velocity metrics.
- `data/raw/`, `data/pending/`, `data/judgment/` are gitignored. Only `data/snapshots/` is committed.
- All file writes are atomic: write `<file>.tmp` then `rename()` over the target.
- Partial failure → `collectionErrors` entry + that feature's `dataOk = false`. Never emit a `0` score for missing data; never silently drop a feature from the snapshot.
- Reruns for the same logical date overwrite, never append/duplicate.

## Real project config (confirmed with user this session)

Discovered via read-only JIRA/GitHub queries and confirmed in chat — **do not treat these as invented**:

- Epic `BOUN-11204` "WPP at Scale", `jira.projectKey: BOUN`, `github.org: bounceinsights`, `timezone: Europe/Dublin`, `epic.startDate: 2026-07-07`, `epic.targetDate: null`.
- M1 (`BOUN-11205`, tier `full`, owner `ruzwid`): F1.1 `BOUN-11207` (ruzwid), F1.2 `BOUN-11208` (`VivekMurarkaIndIre`), F1.3 `BOUN-11209` (`gelbh`), F1.4 `BOUN-11210` (`gelbh`), F1.5 `BOUN-11211` (`EmadNazzal`). Repos: `[dashboard]` for all five — user confirmed this is a **starting point only** ("it really depends on the features... sometimes only 1, sometimes 5"); flag as provisional in config comments.
- M2 (`BOUN-11206`) exists in JIRA but is **excluded** — `schema.ts`'s `Feature.milestone` enum is `["M1","M3","M4"]` only.
- M3 (`BOUN-11290`, tier `light`, owner `TonyCasey`): F3.1 `BOUN-11291`, F3.2 `BOUN-11292`, F3.3 `BOUN-11293`, F3.4 `BOUN-11294`. Repo: `[fieldwork-processing]` — user confirmed "for now... could change later".
- M4 (`BOUN-11248`, tier `light` — inferred from Tony Casey ownership pattern matching M3, not explicitly stated; flag as provisional, easy to fix in config, owner `TonyCasey`): F4.1 `BOUN-11465`, F4.2 `BOUN-11466`, F4.3 `BOUN-11467`, F4.4 `BOUN-11468`, plus `BOUN-11516` "DF 4.1.1 Dashboard app improvments" (user: include as-is, code `DF4.1.1`, unassigned in JIRA → owner defaults to milestone owner `TonyCasey`, flagged). Repo: `[fieldwork-dashboard]` — same "provisional" caveat as M1.
- People: `ruzwid: Ruzzell`, `VivekMurarkaIndIre: Vivek`, `TonyCasey: Tony`, `gelbh: Tomer`, `EmadNazzal: Emad` (first-name display, matching the spec's own example convention).
- `.env` (real creds) renamed to `.env.local` this session — already gitignored via the existing `*.local` glob.

## File Structure

- `config.yaml` — real config for this project (git-committed; contains no secrets, only ticket keys / repo names / logins, which the user has said is fine to commit since it's a public repo per spec).
- `config.example.yaml` — placeholder reference, committed.
- `overrides.yaml` — starts as an empty, documented template.
- `.env.example` — committed, empty values for the 4 env vars.
- `src/lib/schema.ts` — given, untouched.
- `src/lib/config-schema.ts` — zod schemas for `config.yaml` / `overrides.yaml` shape (kept separate from `config.ts` so the shape is easy to scan).
- `src/lib/config.ts` — loads + validates `config.yaml` and `overrides.yaml`, exposes `loadConfig()`, `loadOverrides()`, and `logicalDate(tz, now)`.
- `src/lib/adf.ts` — ADF → plain text/bullets flattener, `extractAcBullets(adfDoc): string[]`.
- `src/lib/jira.ts` — JIRA REST client: `searchSubtasks(parentKey)`, `getIssue(key)`, `searchByJql(jql, fields)`.
- `src/lib/github.ts` — GitHub GraphQL client: `getRepoPrs(org, repo, sinceISO)`, `getDefaultBranch(org, repo)` (cached per run), stack-chain tracer.
- `src/lib/classify.ts` — pure: `classifyPr()`, `traceStackChain()`, `findReleaseGate()`, `deriveSubtaskStatus()`.
- `src/lib/score.ts` — pure: `computeScore()`, `deriveStage()`.
- `scripts/collect.ts` — orchestrates jira.ts + github.ts + classify.ts + score.ts → `data/raw/<date>.json` (full fidelity) + `data/pending/<date>.json` (judge input).
- `scripts/merge.ts` — validates `data/judgment/<date>.json` as untrusted input against `data/pending/<date>.json`, merges with `overrides.yaml`, writes `data/snapshots/<date>.json`.
- `.claude/skills/judge/SKILL.md` — generic judging rules, reads `config.yaml` for the epic name only.
- `tests/adf.test.ts`, `tests/classify.test.ts`, `tests/score.test.ts`, `tests/merge.test.ts`, `tests/config.test.ts` — vitest, fixtures under `tests/fixtures/`, no network.
- `README.md` — append setup/token/routine sections (keep existing TanStack boilerplate above it).
- `.gitleaks.toml` + a `pre-commit` git hook (installed via a `scripts/install-hooks.sh` or `simple-git-hooks`/`husky`-free raw `.git/hooks/pre-commit` — keep it dependency-free since this is a data-layer phase).

## Interfaces (locked across tasks)

```ts
// src/lib/config-schema.ts
type SubtaskStatusMapEntry = { status: SubtaskStatus }; // config.jira.statusMap[rawName]
type MilestoneFeature = { key: string; code: string; owner: string; repos: string[] };
type Milestone = {
  id: "M1" | "M3" | "M4";
  title: string;
  tier: "full" | "light";
  owner: string;
  ticket: string | null;      // milestone's own JIRA key; used when features[] is empty
  repos: string[];             // fallback repos for the milestone / direct-subtask mode
  features: MilestoneFeature[];
};
type Config = {
  epic: { key: string; title: string; startDate: string; targetDate: string | null };
  jira: { projectKey: string; statusMap: Record<string, SubtaskStatus> };
  github: { org: string };
  timezone: string;
  scoreWeights: Record<SubtaskStatus, number>;
  milestones: Milestone[];
  people: Record<string, string>;
};
type OverrideEntry = z.infer<typeof Override>; // from schema.ts, keyed by ticket key in overrides.yaml

// src/lib/config.ts
function loadConfig(path?: string): Config;               // throws with clear message on invalid/missing field
function loadOverrides(path?: string): Record<string, OverrideEntry>;
function logicalDate(timezone: string, now: Date): string; // YYYY-MM-DD

// src/lib/adf.ts
function extractAcBullets(adfDoc: unknown): string[];      // "## Acceptance Criteria" section bullets, plain text

// src/lib/jira.ts
type RawJiraIssue = { key: string; fields: Record<string, any> };
function searchSubtasks(parentKey: string): Promise<RawJiraIssue[]>;   // paginated
function getIssue(key: string): Promise<RawJiraIssue>;

// src/lib/github.ts
type RawPr = {
  repo: string; number: number; title: string; state: "OPEN"|"MERGED"|"CLOSED";
  isDraft: boolean; baseRefName: string; headRefName: string;
  mergedAt: string | null; updatedAt: string; reviewRequests: string[]; filesTouched: string[];
};
function getDefaultBranch(org: string, repo: string): Promise<string>;   // cached per process
function getRepoPrs(org: string, repo: string, sinceISO: string): Promise<RawPr[]>;

// src/lib/classify.ts
function classifyPr(pr: RawPr, defaultBranch: string): { shippedToDefault: boolean };
function traceStackChain(pr: RawPr, allPrsInRepo: RawPr[]): number[];     // PR numbers down to master-based PR
function findReleaseGate(integrationBranch: string, allPrsInRepo: RawPr[], defaultBranch: string):
  { integrationBranch: string; pr: RawPr | null; status: "open"|"merged"|"not_found" };
function deriveSubtaskStatus(jiraStatus: string, statusMap: Record<string,SubtaskStatus>, prs: RawPr[], defaultBranch: string): SubtaskStatus;

// src/lib/score.ts
function computeScore(subtaskStatuses: SubtaskStatus[], weights: Record<SubtaskStatus, number>):
  { score: number; scoreBasis: { shipped: number; staged: number; inReview: number; inProgress: number; blocked: number; todo: number; total: number } };
function deriveStage(score: number, allSubtasksShippedToDefault: boolean): Stage;
```

## Task List

### Task 1: `package.json` deps + scripts + vitest/tsconfig wiring
**Files:** Modify `package.json`, create `vitest.config.ts`, modify `tsconfig.json` if needed for `tests/`/`scripts/` inclusion.
- [ ] Add deps: `zod`, `yaml`, `octokit`, `dotenv`. Add devDeps: `vitest`, `tsx`, `@types/node` (already present).
- [ ] Add scripts: `"collect": "tsx scripts/collect.ts"`, `"merge": "tsx scripts/merge.ts"`, `"test": "vitest run"`.
- [ ] `pnpm install`, verify `pnpm test` runs (0 tests, exits 0).
- [ ] Commit: `chore: add pipeline dependencies and scripts`.

### Task 2: Config schema + loader + `logicalDate`
**Files:** Create `src/lib/config-schema.ts`, `src/lib/config.ts`, `tests/config.test.ts`, `tests/fixtures/config.valid.yaml`, `tests/fixtures/config.invalid.yaml`.
- [ ] Write failing tests: valid config loads and parses; missing required field throws with a message naming the field; `logicalDate("Europe/Dublin", new Date("2026-01-01T00:30:00Z"))` returns `"2026-01-01"` (00:30 UTC in Jan is 00:30 or 01:30 Dublin depending on DST — use a date where UTC 00:30 is still the same calendar day in Dublin, and a second case using a date/time proving a 00:30 *local* run doesn't roll to tomorrow).
- [ ] Implement zod schemas mirroring the `Config`/`Milestone` types above; `loadConfig` reads+parses YAML via the `yaml` package, validates, and on `ZodError` throws `new Error("Invalid config.yaml: " + <field path> + " " + <issue>)`.
- [ ] `logicalDate` uses `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day })` to get `YYYY-MM-DD` in the configured zone — never `Date#toISOString`.
- [ ] Run tests, pass. Commit: `feat: add config loader and logical-date helper`.

### Task 3: ADF flattener
**Files:** Create `src/lib/adf.ts`, `tests/adf.test.ts`, `tests/fixtures/adf-description.json` (a realistic ADF doc with a heading "Acceptance Criteria" followed by a bulletList, plus other unrelated content before/after).
- [ ] Failing test: given the fixture ADF doc, `extractAcBullets(doc)` returns the exact bullet text array from under the "Acceptance Criteria" heading only, ignoring content before/after.
- [ ] Failing test: doc with no "Acceptance Criteria" heading → returns `[]`, does not throw.
- [ ] Implement a recursive walker over ADF `content` nodes: find a `heading` node whose flattened text matches `/acceptance criteria/i`, then collect text from subsequent sibling `bulletList`/`orderedList` `listItem` nodes until the next `heading` of the same or higher level.
- [ ] Run tests, pass. Commit: `feat: add ADF acceptance-criteria flattener`.

### Task 4: `classify.ts` — shipped/staged/stack chains/release gate
**Files:** Create `src/lib/classify.ts`, `tests/classify.test.ts`, `tests/fixtures/prs.ts` (typed fixture builders).
- [ ] Failing tests (one per spec test case): merged to default → `shippedToDefault: true`; merged to integration branch → `false`; 3-deep stack (`PR-A base=integration-1 head=branch-a`, `PR-B base=branch-a head=branch-b`, `PR-C base=master head=integration-1`... construct so `traceStackChain` from the top PR returns `[..., masterPrNumber]`); release PR open → gate status `"open"`; release PR missing → gate status `"not_found"`, never `"merged"`.
- [ ] Implement `classifyPr`, `traceStackChain` (walk `baseRefName === otherPr.headRefName` links until a PR whose `baseRefName === defaultBranch` is found, or stop with what's traced), `findReleaseGate` (search `allPrsInRepo` for a PR whose `headRefName === integrationBranch`; if merged → `"merged"`, if open → `"open"`, if none found → `"not_found"`, never assume shipped).
- [ ] Implement `deriveSubtaskStatus`: base status from `statusMap[jiraStatus] ?? "todo"` (warn via `console.warn` if `jiraStatus` not in map); if any linked PR has `shippedToDefault: true` → `"shipped"`; else if any linked PR is `MERGED` (staged) → `"staged"`; else if any PR is open/review-requested → `"in_review"`; else fall back to the JIRA-mapped base status.
- [ ] Run tests, pass. Commit: `feat: add PR classification and stack-chain tracing`.

### Task 5: `score.ts` — weighted score + stage
**Files:** Create `src/lib/score.ts`, `tests/score.test.ts`.
- [ ] Failing tests: score weighting + round-to-5 (e.g. 3 shipped + 1 todo with default weights → compute exact expected value, assert rounds to nearest 5); `stage="done"` requires all subtasks shipped-to-default, not merely staged (construct a case where every subtask is `"staged"` and score would compute to 100 by weight coincidence — assert stage is `"nearly_done"`, not `"done"`); `stage` boundaries `0/not_started`, `<25/early`, `<70/underway`, `<100/nearly_done`, `100/done`.
- [ ] Implement `computeScore` (weighted mean over `weights`, `Math.round(x/5)*5`) and `deriveStage(score, allShippedToDefault)`.
- [ ] Run tests, pass. Commit: `feat: add score and stage derivation`.

### Task 6: `jira.ts` — REST client
**Files:** Create `src/lib/jira.ts`.
- [ ] Implement `searchSubtasks(parentKey)` using `POST /rest/api/3/search/jql` with `jql: "parent = ${parentKey} ORDER BY created ASC"`, `fields: ["summary","status","assignee","issuetype","updated"]`, `maxResults: 100`, paginating via `nextPageToken` until exhausted.
- [ ] Implement `getIssue(key)` via `GET /rest/api/3/issue/${key}?fields=summary,description,status`.
- [ ] Basic auth header built from `JIRA_EMAIL`/`JIRA_API_TOKEN` env vars, base64-encoded; never logged. Throw a descriptive `Error` (repo name/ticket key in the message, never the token) on non-2xx.
- [ ] No test for this file (network client — integration-tested via `pnpm collect` against real creds per Task 10). Commit: `feat: add JIRA REST client`.

### Task 7: `github.ts` — GraphQL client
**Files:** Create `src/lib/github.ts`.
- [ ] Implement `getDefaultBranch(org, repo)` via a small GraphQL query, memoized in a module-level `Map` keyed by `${org}/${repo}` so it's fetched once per process run.
- [ ] Implement `getRepoPrs(org, repo, sinceISO)` via a batched GraphQL query over `repository(owner,name).pullRequests` (paginate with `first: 50` + `after` cursor), requesting `number,title,state,isDraft,baseRefName,headRefName,mergedAt,updatedAt,reviewRequests.nodes.requestedReviewer,files.nodes.path`; filter client-side to `createdAt >= sinceISO` (or add to the query if the API supports it — GraphQL `pullRequests` has no native date filter, so filter after fetch, sorted by `UPDATED_AT` desc and stop paginating once a page is entirely older than `sinceISO`... actually PRs aren't sorted by created date by default — sort by `CREATED_AT` desc via `orderBy` and stop once a PR's `createdAt < sinceISO`).
- [ ] Auth via `Authorization: Bearer ${GITHUB_TOKEN}` (classic PAT, confirmed working this session). Never logged.
- [ ] Commit: `feat: add GitHub GraphQL client`.

### Task 8: `scripts/collect.ts`
**Files:** Create `scripts/collect.ts`.
- [ ] For each milestone → each feature (or direct-subtask milestone if `features` is empty and `ticket` is set — if both empty, push a `collectionErrors` entry `{source:"jira", scope: milestone.id, message: "milestone has neither features nor a ticket configured"}` and skip, don't crash the run): fetch subtasks via `jira.ts`, fetch the parent issue + `adf.ts`-extract AC bullets (if no AC section, record and continue — don't fail), fetch PRs for each configured repo via `github.ts`, classify via `classify.ts`, score via `score.ts`.
- [ ] Wrap each feature's collection in try/catch: on error, push `collectionErrors` and set that feature's `dataOk: false` with zeroed-but-explicit placeholders (never a bare `0` score presented as real — the UI-facing distinction is `dataOk`, so a false score value doesn't matter for correctness as long as `dataOk` gates it); other features are unaffected (per spec test case).
- [ ] Write `data/raw/<date>.json` (full fidelity, includes PR bodies/file paths — this file is gitignored) and `data/pending/<date>.json` (trimmed: per feature only `key, code, title, owner, score, scoreBasis, daysSinceLastActivity, daysInStaged, releaseGate.status, acCoverage bullets (id+text), subtasks (key, summary, status), PRs (repo#number, title, state, filesTouched)` — no PR bodies, no raw JIRA payloads). Both writes atomic (`.tmp` + `rename`), keyed by `logicalDate(config.timezone, new Date())`.
- [ ] Print per-feature summary to stdout: `score`, `stage`, `shipped/staged/total`, release gate status.
- [ ] Exit non-zero if every feature failed (total collection failure); exit 0 with warnings printed if some failed.
- [ ] Commit: `feat: add collect script`.

### Task 9: `scripts/merge.ts` + trust-boundary tests
**Files:** Create `scripts/merge.ts`, `tests/merge.test.ts`, `tests/fixtures/pending.sample.json`, `tests/fixtures/judgment.valid.json`, `tests/fixtures/judgment.invented-key.json`, `tests/fixtures/judgment.bad-override.json`.
- [ ] Failing tests: missing `data/judgment/<date>.json` → process would exit non-zero (test the exported validation function directly rather than shelling out, e.g. `validateJudgment(judgment, pending)` throws/`returns {ok:false}` with a message naming the offending key); unparseable/schema-invalid judgment → rejected; a `featureKey`/subtask key/PR ref/`acCoverage.id` not present in that day's `pending` file → rejected (blocks invented references); a `scoreOverride` with no `reason` → rejected; a `scoreOverride` deviating `>20` points from the computed score → rejected; a fully valid judgment + no overrides → merges into a `StatusSnapshot`-shape object that passes `StatusSnapshot.parse(...)`.
- [ ] Implement `validateJudgment(judgment: unknown, pending: PendingFile): { ok: true; value: Judgment } | { ok: false; reason: string }` in `merge.ts` (exported for the test above) using `Judgment.safeParse` from `schema.ts` first, then the cross-reference checks against `pending`.
- [ ] Implement `merge.ts` main: read `data/pending/<date>.json` + `data/judgment/<date>.json`, validate, read `overrides.yaml` and drop any entry whose `expires` date has passed (in `config.timezone`), build the final `StatusSnapshot` (headline/kpis computed from `pending` + judgment + overrides), `StatusSnapshot.parse()` it before writing (fail loudly if the assembled object isn't schema-valid), write `data/snapshots/<date>.json` atomically. Non-zero exit on any validation failure, with the specific reason printed — never a silent partial write.
- [ ] Run tests, pass. Commit: `feat: add merge script with judgment trust boundary`.

### Task 10: `.claude/skills/judge/SKILL.md`
**Files:** Create `.claude/skills/judge/SKILL.md`.
- [ ] Write the skill file: reads `config.yaml` for the epic title only (no hardcoded project name anywhere in the file); reads `data/pending/<date>.json`; writes `data/judgment/<date>.json` matching the `Judgment` zod shape from `schema.ts`; states every judging rule verbatim from the spec's JUDGMENT LAYER section (coverage vocabulary, AC paraphrasing requirement, one-sentence rationale distinguishing shipped/staged, confidence guardrails, fresh callouts, never invent keys/numbers); states explicitly it must not read or write anything else.
- [ ] No automated test (this is a prompt file executed by a human-invoked Claude Code routine, not code) — validated implicitly by `merge.ts`'s trust boundary. Commit: `docs: add judge skill`.

### Task 11: Real `config.yaml` + `config.example.yaml` + `overrides.yaml` + `.env.example`
**Files:** Create `config.yaml`, `config.example.yaml`, `overrides.yaml`, `.env.example`.
- [ ] `config.yaml`: populate with the confirmed real values from the "Real project config" section above. Add YAML comments on the M1/M4 `repos` lists and the M4 `tier` flagging them as provisional starting points per this session's discussion. `jira.statusMap` default: `{"Done": "shipped", "Code Review": "in_review", "In Progress": "in_progress", "To Do": "todo", "Blocked": "blocked"}` (a sensible generic default per spec — `deriveSubtaskStatus` in Task 4 then upgrades/downgrades using GitHub PR state, so "Done" here is a base hint, not the final word).
- [ ] `config.example.yaml`: same shape, all values replaced with obvious placeholders (`YOUR-PROJECT-1234`, `your-org`, `octocat`, etc.).
- [ ] `overrides.yaml`: empty `{}` with a comment block documenting the shape (`<ticket-key>: { note, author, suppressStallWarning, expires }`).
- [ ] `.env.example`: the 4 var names with empty values.
- [ ] Commit: `feat: add project config.yaml and example files`.

### Task 12: README + gitleaks pre-commit hook
**Files:** Modify `README.md` (append, keep existing TanStack sections), create `.gitleaks.toml`, create `.git/hooks/pre-commit` (not tracked by git itself, but the script content should also live at `scripts/install-hooks.sh` so it's committed and runnable) and wire a `"postinstall": "node scripts/install-hooks.mjs"` in `package.json` if not already added in Task 1 (add it there instead — revise Task 1 if needed).
- [ ] README additions: env setup (copy `.env.example` → `.env.local`, fill in 4 vars), JIRA token creation steps (Atlassian account settings → API tokens), GitHub token scopes needed (classic PAT with `repo`, `read:org`), and the daily routine: `pnpm collect` → run the judge skill in Claude Code → `pnpm merge` → `git add data/snapshots && git commit && git push`, **halting on any non-zero exit and never committing when merge fails**.
- [ ] `.gitleaks.toml`: default ruleset, no allowlist entries pointing at this repo's own files.
- [ ] Pre-commit hook: run `gitleaks protect --staged` if `gitleaks` is on `PATH`, else print a one-line warning and continue (don't hard-block contributors who haven't installed it, but make it loud).
- [ ] Commit: `docs: add README setup docs and gitleaks pre-commit hook`.

### Task 13: End-to-end verification
- [ ] `pnpm test` — full vitest suite from Task 2–9 green.
- [ ] `pnpm collect` against real `.env.local` creds — confirm `data/raw/<date>.json` and `data/pending/<date>.json` are written, per-feature stdout summary printed, exits 0.
- [ ] Run the judge skill's instructions directly (I am the Claude Code routine) against today's real `data/pending/<date>.json`, writing `data/judgment/<date>.json`.
- [ ] `pnpm merge` — confirm `data/snapshots/<date>.json` is written and `StatusSnapshot.parse()`-valid, exits 0.
- [ ] Rerun `pnpm collect && pnpm merge` a second time same-day — confirm files are overwritten, not duplicated/appended.
- [ ] No commit for this task (verification only) — report results to the user.

## Self-Review Notes

- Spec coverage: AUTH ✅ (Task 6/7/12), CONFIG SHAPE ✅ (Task 2/11), JIRA ✅ (Task 3/6/8), GITHUB ✅ (Task 7/8), CENTRAL RULE ✅ (Task 4), DERIVED FIELDS ✅ (Task 4/5/8), JUDGMENT LAYER ✅ (Task 9/10), CORRECTNESS ✅ (Task 2 logicalDate, Task 8/9 atomic writes + dataOk, Task 9 idempotent overwrite), TESTS ✅ (every bullet maps 1:1 to a Task 2–9 test), DELIVERABLE ✅ (Task 13).
- No placeholders: every task above has concrete field names, function signatures, and fixture shapes rather than "add validation"-style steps.
- Type consistency checked: `SubtaskStatus`/`Stage`/`ReleaseGate` used identically across Tasks 4/5/8/9 match `schema.ts` exactly (not redefined).
