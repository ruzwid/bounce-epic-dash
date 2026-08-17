# Daily routine

The prompt each team runs as a Claude Code routine to refresh its own epic's
status. **One epic per run.** Copy the block below, replace `<epic>` with your
epic's slug from [`epics.yaml`](../epics.yaml), and that's the whole
customisation — nothing else differs between teams.

Current slugs:

| slug | epic | config |
|---|---|---|
| `wpp-at-scale` | WPP at Scale (BOUN-11204) | [`epics/wpp-at-scale/config.yaml`](../epics/wpp-at-scale/config.yaml) |
| `research-efficiencies` | Research Efficiencies (BOUN-11173) | [`epics/research-efficiencies/config.yaml`](../epics/research-efficiencies/config.yaml) |

Two teams running this on the same day do not conflict. Every file the
pipeline writes is under a per-epic directory (`data/*/<epic>/`), so the
only shared thing is the branch — and each run commits a path the other run
never touches.

---

## The prompt

> Daily engineering status refresh for the **`<epic>`** epic. Work in
> bounce-epic-dash, directly on `main` — this pipeline only ever writes
> `data/snapshots/<epic>/`, which is safe to push straight to main so Vercel
> redeploys immediately. No feature branch, no PR.
>
> Every command below is scoped to one epic. Never drop the `--epic` flag and
> never substitute a different slug: another team runs the same routine for
> their own epic against this same repo, and an unscoped or mis-scoped run
> would publish their epic's page from your run's data.
>
> Run these steps in order and stop immediately if any command exits non-zero.
>
> ```
> git checkout main
> git pull origin main
> ```
>
> **Preflight check.** Confirm required collector credentials are set
> (`JIRA_BASE_URL` + Jira auth, GitHub token) and that `epics/<epic>/config.yaml`
> exists. If anything is missing, STOP now and report exactly what — do not
> proceed to install or collect.
>
> ```
> pnpm install --frozen-lockfile
> ```
>
> Run this if either condition holds: `node_modules` is missing (fresh/ephemeral
> container), or the lockfile changed from the pull. Don't skip install just
> because the lockfile itself didn't change — a fresh container has no
> `node_modules` at all regardless of lockfile state.
>
> ```
> pnpm collect --epic <epic>
> ```
>
> Writes `data/pending/<epic>/<date>.json` (and `data/raw/<epic>/<date>.json` —
> both are gitignored, so they never show up in `git status`). If it fails,
> STOP — do not commit, do not improvise a workaround, do not fall back to CLI
> tools. Report the error, including the collection error list if present.
>
> **Judge.** Read `.claude/skills/judge/SKILL.md` and follow it exactly, for the
> `<epic>` epic. Read `data/pending/<epic>/<date>.json`, write
> `data/judgment/<epic>/<date>.json`. Write nothing else. Do not edit source,
> any config, or prior snapshots. Do not read or write any other epic's files.
>
> ```
> pnpm merge --epic <epic>
> ```
>
> Validates the judgment and builds `data/snapshots/<epic>/<date>.json`. If it
> exits non-zero, the judgment was invalid — re-read the SKILL.md output
> contract, fix `data/judgment/<epic>/<date>.json`, and retry merge ONCE. If it
> fails again, STOP and report. Never commit when merge fails.
>
> **Commit only your own epic's snapshots.** `data/judgment/` is gitignored by
> design (its useful content is already merged into the snapshot) and must never
> be force-added:
>
> ```
> git add data/snapshots/<epic>
> git commit -m "status(<epic>): <date>"
> git push origin main
> ```
>
> If `git status` shows changes to any other path — including another epic's
> snapshots — stop and report instead of committing them.
>
> If the push is rejected because the other team pushed first, `git pull
> --rebase origin main` and push again. Your commit touches only
> `data/snapshots/<epic>/`, so this rebase can't conflict; if it somehow does,
> stop and report rather than resolving it.
>
> **Rules:**
>
> - Never modify source, any `epics/*/config.yaml`, any `overrides.yaml`,
>   `epics.yaml`, or the schema.
> - Never run `jira`/`gh` CLI commands or `curl`. All data comes from
>   `pnpm collect`.
> - Never hand-edit a snapshot. If the data looks wrong, report it — a wrong
>   snapshot published silently is worse than a missing one.
> - If today's snapshot already exists, rerun anyway; the pipeline overwrites by
>   design.
>
> **Report at the end:** the epic slug, features processed, any
> `collectionErrors`, any features with `dataOk: false`, and the commit SHA.

---

## Adding a third epic

1. `epics/<slug>/config.yaml` — copy [`config.example.yaml`](../config.example.yaml)
   and fill in the epic key, milestones and people.
2. `epics/<slug>/overrides.yaml` — optional; copy an existing one for the header
   comment.
3. Add `<slug>` to the `epics:` list in [`epics.yaml`](../epics.yaml).
4. Run the routine above with the new slug.

Until step 4 runs, the epic appears in the switcher with a "no snapshots yet"
page. That is the intended state, not a broken one.
