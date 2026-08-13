Build the data collection pipeline for an engineering status dashboard.
Data layer only — no UI in this phase.

Everything is driven by config.yaml. Nothing about a specific epic, project,
company, or set of engineers may be hardcoded in source. The pipeline should
work for any JIRA epic + GitHub org described in config.

STACK
TanStack Start (already scaffolded), TypeScript strict, zod, yaml, Octokit,
vitest. pnpm. Scripts run via tsx. Node 20+.

WHAT IT DOES
Pull JIRA + GitHub data for a configured epic, derive a deterministic status
snapshot, apply a judgment layer, write dated JSON to data/snapshots/.
Runs once each weekday morning via a Claude Code routine.

────────────────────────────────────────
FILES TO BUILD

  config.yaml               epic, target date, timezone, milestones, features,
                            owners, repos, login->name map, score weights
  config.example.yaml       committed reference with placeholder values
  overrides.yaml            per-ticket human notes
  src/lib/schema.ts         zod schemas — I'm providing these, use verbatim
  src/lib/config.ts         load + validate config.yaml and overrides.yaml
  src/lib/adf.ts            Atlassian Document Format -> plain text/bullets
  src/lib/jira.ts           JIRA REST client
  src/lib/github.ts         GitHub GraphQL client
  src/lib/classify.ts       shipped/staged/stack/release-gate logic (pure)
  src/lib/score.ts          weighted score + stage derivation (pure)
  scripts/collect.ts        -> data/raw/<date>.json + data/pending/<date>.json
  scripts/merge.ts          judgment + overrides -> data/snapshots/<date>.json
  .claude/skills/judge/SKILL.md
  tests/*.test.ts           vitest, fixtures only, no network
  README.md                 setup, token scopes, routine instructions
  .env.example              committed, empty values

────────────────────────────────────────
AUTH

Env vars only, from .env.local (gitignored):
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, GITHUB_TOKEN

There is NO ANTHROPIC_API_KEY and no programmatic model call anywhere in this
codebase. Do not add one. Do not shell out to the `jira` or `gh` CLIs — use
fetch and Octokit directly. Never log a token, never write one to any output
file. Add a gitleaks or git-secrets pre-commit hook; this repo will be public.

────────────────────────────────────────
CONFIG SHAPE

config.yaml drives everything. Validate it with zod at load; fail loudly with
a clear message on any missing field.

  epic:
    key: BOUN-11204
    title: "WPP at Scale"
    startDate: 2026-07-07        # PR search floor
    targetDate: null             # nullable
  jira:
    projectKey: BOUN
  github:
    org: bounceinsights
  timezone: Europe/Dublin
  scoreWeights:                  # configurable, these are the defaults
    shipped: 1.0
    done_unverified: 1.0
    staged: 0.5
    in_review: 0.3
    in_progress: 0.15
    blocked: 0
    todo: 0
  milestones:
    - id: M1
      title: "Core Operational Efficiency"
      tier: full
      features:
        - key: BOUN-11207
          code: "F1.1"
          owner: ruzwid
          repos: [dashboard]
        # ... etc
    - id: M3
      title: "WPP API Platform"
      tier: light
      ticket: null               # unknown — must error clearly if used unset
      owner: TonyCasey
      repos: [wpp-api]
  people:
    ruzwid: Ruzzell
    VivekMurarkaIndIre: Vivek
    # ...

Light-tier milestones may have either child feature tickets or subtasks
directly under the milestone ticket — handle both, detect which.

────────────────────────────────────────
JIRA

Basic auth: base64(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).
POST /rest/api/3/search/jql. The old GET /search returns 410 — do not use it.

  - Subtasks per parent: jql `parent = <KEY> ORDER BY created ASC`,
    fields summary,status,assignee,issuetype,updated, maxResults 100.
    Paginate if needed.
  - Fetch each parent issue itself and extract "## Acceptance Criteria"
    bullets from its description. Descriptions are ADF (nested JSON) — write
    a proper flattener in src/lib/adf.ts. Do not regex the raw payload.
  - If a parent has no AC section, record that and continue; do not fail.

Map raw JIRA status names to our SubtaskStatus enum via a configurable map in
config.yaml, with a sensible default and a warning for unmapped names.

────────────────────────────────────────
GITHUB

Octokit GraphQL, batched — the REST search API's 30/min limit will bite.
Filter PRs to authored-after epic.startDate. Fetch per PR: number, title,
state, isDraft, baseRefName, headRefName, mergedAt, updatedAt, reviewRequests,
and file paths (paths only, never patch content).

Cache each repo's default branch once per run.

Attribute PRs to features by subtask ticket key in the branch or title.
Where an owner covers multiple features, the ticket key is the discriminator.
PRs by non-owners against a feature's repos are review activity, not ownership.

────────────────────────────────────────
THE CENTRAL RULE — merged does not mean shipped

This codebase uses stacked PRs on integration branches.

  shipped = state MERGED && baseRefName === that repo's default branch
  staged  = state MERGED && baseRefName !== default branch

Never collapse staged into shipped, anywhere, in any count or label.

  done_unverified = JIRA status is already Done && neither shipped nor
                     staged is proven from GitHub

A JIRA Done status is never assumed to mean shipped on its own — and when
the story is Done but the evidence only supports staged (or no PR evidence
at all), it is not collapsed into staged either. It gets its own status,
done_unverified, so the "Done in JIRA, unconfirmed in GitHub" gap stays
visible rather than being absorbed into either of the other two.

  - Trace stack chains: PR A's baseRefName may equal PR B's headRefName.
    Follow down to the master-based PR at the bottom. Record the chain.
  - For each staged integration branch, find its release PR into the default
    branch. Record status: open | merged | not_found.
    If not found, say not_found. NEVER assume shipped.

────────────────────────────────────────
DERIVED FIELDS (deterministic, pure functions, no judgment)

  score  = weighted mean of subtask statuses using config scoreWeights,
           rounded to nearest 5
  stage  = 0 not_started | <25 early | <70 underway | <100 nearly_done |
           100 done — and `done` additionally requires every subtask shipped
           to the default branch, not merely staged
  daysSinceLastActivity, daysInStaged, reviewQueue with ageDays,
  KPI counts, headline.featuresWithNothingOnMaster

────────────────────────────────────────
JUDGMENT LAYER (agent, not API)

The judgment step is a Claude Code routine reading a file and writing a file.
Treat its output as untrusted input.

  collect.ts → data/raw/<date>.json       full fidelity, gitignored
             → data/pending/<date>.json   judge input, trimmed
  [agent]    → data/judgment/<date>.json
  merge.ts   → data/snapshots/<date>.json

data/pending/<date>.json — small and pre-shaped. Per feature only:
key, code, title, owner, computed score + scoreBasis, daysSinceLastActivity,
daysInStaged, releaseGate status, AC bullets (id + text), subtasks
(key, summary, derived status), PRs (repo#number, title, state, file paths).
No PR bodies. No raw JIRA payloads.

scripts/merge.ts is the trust boundary. It MUST fail with a non-zero exit if:
  - judgment/<date>.json is missing, unparseable, or schema-invalid
  - any featureKey, subtask key, PR ref, or acCoverage id is not present in
    that day's pending file  (blocks invented references)
  - a scoreOverride has no reason, or deviates more than 20 points from the
    computed score
On success it merges judgment + non-expired overrides.yaml entries into a
schema-valid snapshot.

.claude/skills/judge/SKILL.md — generic, reads epic name from config.yaml,
never hardcodes a project. Contains the judging rules:
  - coverage is covered | partial | no_signal. Wording is "no ticket or PR
    references this" — never "not implemented".
  - AC labels must be paraphrased, never copied verbatim (public repo)
  - rationale: one sentence per feature, grounded in real counts, MUST
    distinguish shipped from staged
  - confidence guardrails: tidy subtask breakdown + 3 weeks of silence =
    medium/low, stalled — not high, on track. Sparse tickets with active
    daily PRs is not "not started".
  - callouts derived fresh each run, never carried over from a prior day
  - never invent ticket keys, PR numbers, or percentages
  - reads data/pending/<date>.json, writes data/judgment/<date>.json, nothing
    else

────────────────────────────────────────
CORRECTNESS

  - All dates are logical dates in config.timezone. Snapshot filename = that
    date. A 00:30 run must not write tomorrow's file.
  - Idempotent: same-day rerun overwrites, never appends.
  - Atomic writes: write .tmp, then rename.
  - Partial failure: record in collectionErrors, set feature.dataOk = false.
    Never emit 0% for missing data. Never silently drop a feature.
  - Snapshots must be publication-safe: no PR bodies, no verbatim AC text,
    no file paths, no per-person velocity metrics. raw/ and pending/ are
    gitignored; only snapshots/ is committed.
  - Deltas are NOT stored — they're computed at render time from consecutive
    snapshots.

────────────────────────────────────────
TESTS (vitest, fixtures, no network)

  merged to default branch          -> shipped
  merged to integration branch      -> staged (unless JIRA status is
                                        already Done, see next line)
  Done in JIRA + merged to integration branch -> done_unverified, not staged
  3-deep stack                      -> traced to master-based PR
  release PR open                   -> staged, not shipped
  release PR missing                -> not_found, never assumed shipped
  score weighting + round-to-5
  stage=done requires all shipped, not staged
  JIRA failure on one feature       -> dataOk false, others unaffected
  same-day rerun                    -> overwrite, not duplicate
  merge rejects invented feature key / PR ref / AC id
  merge rejects unreasoned or >20pt scoreOverride
  ADF flattener extracts bullets from a realistic description
  timezone: 00:30 Dublin run writes today's date, not tomorrow's

────────────────────────────────────────
DELIVERABLE

`pnpm collect` produces a valid pending file and prints a per-feature summary
to stdout: score, stage, shipped/staged/total, release gate status.
`pnpm merge` validates and produces a schema-valid snapshot.

README documents: env setup, JIRA token creation, GitHub token scopes, and the
routine — `pnpm collect` → run the judge skill → `pnpm merge` → commit → push,
halting on any non-zero exit and never committing when merge fails.

Ask me before inventing any config value. The M1 feature keys are known; the
M3/M4 ticket keys and M4's repo are not — leave them null in config with a
clear error if the pipeline is asked to process them unset.

Read src/lib/schema.ts first — it is the contract. Do not modify it.