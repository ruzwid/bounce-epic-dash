// src/lib/stories.ts
// Story/Sub-task helpers shared by the collector and the dashboard.
//
// Structurally typed rather than importing the zod types, so the same
// function serves scripts/collect.ts's RawStory (carrying RawPrRecord) and
// the published schema's Story (carrying PrRef) without either side having
// to convert first.

type MinimalPr = { repo: string; number: number };
type MinimalStory<P extends MinimalPr> = { prs: P[]; subtasks: { prs: P[] }[] };

/**
 * Every pull request that is evidence for a Story: its own, plus its
 * Sub-tasks'.
 *
 * A Story deliberately stores only PRs matched to its own key (see
 * schema.ts), so this is the one place that assembles the full set. Before
 * Sub-tasks were collected at all, a story like BOUN-11441 — zero PRs of
 * its own, two open PRs on its sub-tasks — rendered as "no pull request is
 * open", which was simply false.
 *
 * Deduplicated by repo#number: a PR whose title mentions both the story and
 * one of its sub-tasks matches twice and must still count once.
 */
export function storyPrs<P extends MinimalPr>(story: MinimalStory<P>): P[] {
  const seen = new Set<string>();
  return [...story.prs, ...story.subtasks.flatMap((s) => s.prs)].filter((pr) => {
    const id = `${pr.repo}#${pr.number}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Every PR across a Feature — each story's own plus its sub-tasks'. */
export function featurePrs<P extends MinimalPr>(feature: { stories: MinimalStory<P>[] }): P[] {
  const seen = new Set<string>();
  return feature.stories.flatMap(storyPrs).filter((pr) => {
    const id = `${pr.repo}#${pr.number}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
