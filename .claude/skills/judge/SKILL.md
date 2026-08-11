---
name: judge
description: Reads today's data/pending/<date>.json for the configured epic and writes data/judgment/<date>.json — rationale, confidence, AC coverage, and callouts for each tracked feature. Use as the middle step of the daily collection routine, between "pnpm collect" and "pnpm merge".
---

# Judge

You are the judgment layer of a data collection pipeline for an engineering
status dashboard. This project is generic — read `config.yaml` for the
actual epic name (`epic.title`) and never hardcode a project, company, or
person's name in your reasoning; whatever is in config.yaml for this run is
the only project you know about.

**Scope, strictly:**
- Read `config.yaml` (for `epic.title` only — you don't need anything else
  from it).
- Read `data/pending/<date>.json` for today's logical date. To find today's
  date, look at the most recently modified file in `data/pending/` — that's
  the one `pnpm collect` just wrote.
- Write `data/judgment/<date>.json` for that same date.
- Do not read or write anything else. Do not read `data/raw/<date>.json` —
  it contains full-fidelity data (PR bodies, file paths) you don't need and
  shouldn't have access to. Do not read prior days' judgment or snapshot
  files — every callout must be judged fresh from today's pending data.

**Output shape** (must validate against the `Judgment` schema in
`src/lib/schema.ts` — do not deviate from this shape):

```json
{
  "schemaVersion": 1,
  "date": "<the pending file's date>",
  "features": [
    {
      "featureKey": "<a key that appears in pending.json>",
      "rationale": "<one sentence>",
      "confidence": "high | medium | low",
      "acCoverage": [
        { "id": "<an id from that feature's pending.acBullets>", "label": "<paraphrased>", "coverage": "covered | partial | no_signal", "evidence": ["<subtask key or repo#number PR ref from that feature's pending data>"] }
      ],
      "callouts": [
        { "type": "drift | spec_gap | release_blocked | stalled", "severity": "info | warn | risk", "message": "<one sentence>", "refs": ["<subtask key or repo#number PR ref from that feature's pending data>"] }
      ],
      "scoreOverride": null
    }
  ]
}
```

Judge every feature present in `data/pending/<date>.json`. `scripts/merge.ts`
is the trust boundary and will reject this file outright — with a non-zero
exit and no snapshot written — if you violate any rule below.

## Judging rules

1. **Never invent.** Every `featureKey`, `acCoverage.id`, and callout `ref`
   you write must already exist in that feature's entry in
   `data/pending/<date>.json` — a real subtask key, a real `repo#number` PR
   ref, or a real AC bullet id. `merge.ts` checks this exactly; an invented
   reference fails the whole run. Never invent a ticket key, PR number, or
   percentage that isn't already in the pending data.

2. **AC coverage vocabulary.** Use exactly `covered`, `partial`, or
   `no_signal` for `coverage`. When there is no ticket or PR evidence for an
   AC bullet, the wording is **"no ticket or PR references this"** — never
   "not implemented" (you don't know that; you only know nothing references
   it).

3. **Paraphrase AC labels.** `label` must be your own paraphrase of the AC
   bullet's intent, never the verbatim bullet text — this project may be a
   public repo, and copying spec text verbatim into a published snapshot
   defeats the point of the AC bullet being read only by you, not published.

4. **Rationale distinguishes shipped from staged.** Your one-sentence
   `rationale` per feature must be grounded in the real counts in
   `scoreBasis` and must not blur "merged" with "shipped" — staged work
   (merged to an integration branch, not yet on the default branch) is not
   done. Say so plainly when it applies (e.g. "most subtasks are staged on
   an integration branch awaiting a release PR" is correct; "already
   shipped" would not be, if `scoreBasis.staged > 0` and `shipped` isn't the
   whole total).

5. **Confidence guardrails.** A tidy subtask breakdown combined with weeks
   of no activity (`daysSinceLastActivity` large) is `medium` or `low` and
   "stalled" — never `high`/"on track" just because the ticket structure
   looks complete. Conversely, sparse ticket coverage with active, frequent
   PRs is not "not started" — judge from the real signal in `scoreBasis`,
   `daysSinceLastActivity`, and the PR list together, not from ticket count
   alone.

6. **Callouts are derived fresh every run.** Do not carry a callout forward
   from a prior day's judgment or snapshot (you shouldn't have read those
   anyway) — decide type/severity/message/refs from today's pending data
   only.

7. **scoreOverride is rare and justified.** Leave it `null` unless you have
   a real reason (from the pending data) to believe the computed score is
   materially wrong. If you do set one, `reason` is required (non-empty) and
   `value` must be within 20 points of that feature's pending `score` —
   `merge.ts` rejects anything outside that.

## After writing

Write `data/judgment/<date>.json` as a single JSON file (not JSON5, no
comments, no trailing commas). Do not run `pnpm merge` yourself — that's the
next step in the daily routine, run separately (see README.md).
