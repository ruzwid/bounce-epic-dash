// src/lib/dashboard/reviewExport.ts
// Turns the Reviews page's own data (StoryReviewGroup[]) into a per-reviewer
// checklist, in three flavors. Pure and React-free so each formatter is
// testable without mounting the page.
import type { PrReviewStatus, StoryReviewGroup, TicketReviewGroup } from "./nav.ts";
import { jiraIssueUrl } from "./appConfig.ts";

/** Shared shape behind filterGroupByReviewer/filterGroupByAuthor below:
 *  keep only the PRs `keep` accepts, recomputing oldestWaitDays from
 *  `ageDaysOf` on what's left — a ticket or group with nothing left drops
 *  out entirely rather than showing an empty shell. */
function narrowGroup(
  group: StoryReviewGroup,
  keep: (p: PrReviewStatus) => boolean,
  ageDaysOf: (p: PrReviewStatus) => number[],
): StoryReviewGroup | null {
  const tickets = group.tickets
    .map((t) => {
      const prs = t.prs.filter(keep);
      if (prs.length === 0) return null;
      const waits = prs.flatMap(ageDaysOf);
      return { ...t, prs, oldestWaitDays: waits.length > 0 ? Math.max(...waits) : null };
    })
    .filter((t): t is TicketReviewGroup => t !== null);
  if (tickets.length === 0) return null;

  const waits = tickets.map((t) => t.oldestWaitDays).filter((d): d is number => d !== null);
  return { ...group, tickets, oldestWaitDays: waits.length > 0 ? Math.max(...waits) : null };
}

/** Narrows a story's tickets/PRs down to the ones actually waiting on
 *  `reviewer` specifically — an approved or commented entry for that same
 *  person doesn't count, since this answers "what does X still need to
 *  review". Shared by the page's own reviewer filter and the
 *  copy-to-clipboard export below, so "filter to me, then copy" always
 *  exports exactly what's on screen. */
export function filterGroupByReviewer(group: StoryReviewGroup, reviewer: string): StoryReviewGroup | null {
  return narrowGroup(
    group,
    (p) => p.reviewers.some((r) => r.reviewer === reviewer && r.state === "requested"),
    (p) => p.reviewers.filter((r) => r.reviewer === reviewer && r.state === "requested").map((r) => r.ageDays!),
  );
}

/** Narrows a story's tickets/PRs down to the ones `author` opened. Sorts
 *  by whatever pending wait is left on those PRs (from any reviewer) —
 *  the same "oldest first" thesis the page uses everywhere else. */
export function filterGroupByAuthor(group: StoryReviewGroup, author: string): StoryReviewGroup | null {
  return narrowGroup(
    group,
    (p) => p.pr.author === author,
    (p) => p.reviewers.filter((r) => r.state === "requested" && r.ageDays !== null).map((r) => r.ageDays!),
  );
}

type PrLine = { repo: string; number: number; url: string };
type TicketOutline = { key: string; title: string; assignee: string | null; jiraUrl: string | null; prs: PrLine[] };
type StoryOutline = TicketOutline & { subtasks: TicketOutline[] };
export type ReviewerSection = { reviewer: string; stories: StoryOutline[] };

function toPrLine(p: TicketReviewGroup["prs"][number]): PrLine {
  return { repo: p.pr.repo, number: p.pr.number, url: p.pr.url };
}

function toTicketOutline(t: TicketReviewGroup): TicketOutline {
  return {
    key: t.ticket.key,
    title: t.ticket.summary,
    assignee: t.ticket.assignee,
    jiraUrl: jiraIssueUrl(t.ticket.key),
    prs: t.prs.map(toPrLine),
  };
}

/** One story's outline: its own direct PRs (if any open PR sits on the
 *  story ticket itself) plus every Sub-task that has open PRs, nested —
 *  the same story/ticket shape ReviewGroupCard renders, flattened into
 *  plain data so the three formatters below don't each re-derive it. */
function buildStoryOutline(group: StoryReviewGroup): StoryOutline {
  const direct = group.tickets.find((t) => t.ticket.key === group.story.key);
  const subtasks = group.tickets.filter((t) => t.ticket.key !== group.story.key);
  return {
    key: group.story.key,
    title: group.story.summary,
    assignee: group.story.assignee,
    jiraUrl: jiraIssueUrl(group.story.key),
    prs: direct ? direct.prs.map(toPrLine) : [],
    subtasks: subtasks.map(toTicketOutline),
  };
}

/** One section per reviewer — "here's what X needs to review" — narrowed
 *  to a single name when `activeFilter` is set, and to one author's PRs
 *  when `authorFilter` is set, so copying while the page is filtered
 *  exports exactly what's on screen. Reviewers with nothing waiting on
 *  them (everything they had got filtered out, or nobody's requested them
 *  at all) don't get an empty section. */
export function buildReviewerSections(
  groups: StoryReviewGroup[],
  reviewers: string[],
  activeFilter: string | null,
  authorFilter: string | null = null,
): ReviewerSection[] {
  const scoped = authorFilter
    ? groups.map((g) => filterGroupByAuthor(g, authorFilter)).filter((g): g is StoryReviewGroup => g !== null)
    : groups;
  const names = activeFilter ? [activeFilter] : reviewers;
  return names
    .map((reviewer) => {
      const stories = scoped
        .map((g) => filterGroupByReviewer(g, reviewer))
        .filter((g): g is StoryReviewGroup => g !== null)
        .map(buildStoryOutline);
      return { reviewer, stories };
    })
    .filter((section) => section.stories.length > 0);
}

function ticketLabel(t: TicketOutline): string {
  return t.assignee ? `${t.title} — ${t.assignee}` : t.title;
}

/** Standard GFM: ATX headings per reviewer, markdown links, `- [ ]`
 *  checkboxes on the PR lines only — the ticket/story line is context, not
 *  itself an action. Meant for pasting into a PR description, a README, or
 *  anywhere else that renders CommonMark. */
export function toMarkdown(sections: ReviewerSection[]): string {
  return sections
    .map(({ reviewer, stories }) => {
      const lines = [`## ${reviewer}`, "", ...stories.flatMap((story) => storyLinesMd(story, 0))];
      return lines.join("\n").trimEnd();
    })
    .join("\n\n---\n\n");
}

function storyLinesMd(story: StoryOutline, depth: number): string[] {
  const pad = "  ".repeat(depth);
  const label = story.jiraUrl ? `[${story.key}](${story.jiraUrl})` : story.key;
  const lines = [`${pad}- **${label}** ${ticketLabel(story)}`];
  for (const pr of story.prs) {
    lines.push(`${pad}  - [ ] [${pr.repo}#${pr.number}](${pr.url})`);
  }
  for (const sub of story.subtasks) {
    const subLabel = sub.jiraUrl ? `[${sub.key}](${sub.jiraUrl})` : sub.key;
    lines.push(`${pad}  - **${subLabel}** ${ticketLabel(sub)}`);
    for (const pr of sub.prs) {
      lines.push(`${pad}    - [ ] [${pr.repo}#${pr.number}](${pr.url})`);
    }
  }
  return lines;
}

/** Bare URLs rather than `[label](url)` — Notion's paste-as-markdown
 *  always turns a bare link into a real inline link, where a markdown
 *  link sometimes pastes as literal text depending on where it lands. A
 *  plain-text name line (no `#` heading) reads as a sub-header without
 *  forcing every reviewer's section into a big Heading block, and `---`
 *  between sections becomes a real divider block on paste. */
export function toNotion(sections: ReviewerSection[]): string {
  return sections
    .map(({ reviewer, stories }) => {
      const lines = [`${reviewer}'s`, "", ...stories.flatMap((story) => storyLinesNotion(story, 0))];
      return lines.join("\n").trimEnd();
    })
    .join("\n\n---\n\n");
}

function storyLinesNotion(story: StoryOutline, depth: number): string[] {
  const pad = "  ".repeat(depth);
  const jira = story.jiraUrl ? ` — ${story.jiraUrl}` : "";
  const lines = [`${pad}- ${story.key} — ${ticketLabel(story)}${jira}`];
  for (const pr of story.prs) {
    lines.push(`${pad}  - [ ] ${pr.url}`);
  }
  for (const sub of story.subtasks) {
    const subJira = sub.jiraUrl ? ` — ${sub.jiraUrl}` : "";
    lines.push(`${pad}  - ${sub.key} — ${ticketLabel(sub)}${subJira}`);
    for (const pr of sub.prs) {
      lines.push(`${pad}    - [ ] ${pr.url}`);
    }
  }
  return lines;
}

/** Slack mrkdwn is not markdown — `*bold*` (single asterisk), `<url|label>`
 *  links, no ATX headings, and no real nested-list rendering, so this
 *  flattens the story/subtask tree into one line per PR instead of trying
 *  to fake indentation Slack won't honor. No native checkbox either; ☐
 *  is the closest a plain message gets to "this is a to-do". */
export function toSlack(sections: ReviewerSection[]): string {
  return sections
    .map(({ reviewer, stories }) => {
      const items = flattenStories(stories);
      const lines = [
        `*${reviewer}'s*`,
        ...items.map((item) => {
          const prLink = `<${item.pr.url}|${item.pr.repo}#${item.pr.number}>`;
          const ticketLink = item.jiraUrl ? `<${item.jiraUrl}|${item.key}>` : item.key;
          const who = item.assignee ? ` (${item.assignee})` : "";
          return `☐ ${prLink} — ${ticketLink} ${item.title}${who}`;
        }),
      ];
      return lines.join("\n");
    })
    .join(`\n\n${"─".repeat(24)}\n\n`);
}

function flattenStories(stories: StoryOutline[]): (TicketOutline & { pr: PrLine })[] {
  const items: (TicketOutline & { pr: PrLine })[] = [];
  for (const story of stories) {
    for (const pr of story.prs) items.push({ ...story, pr });
    for (const sub of story.subtasks) {
      for (const pr of sub.prs) items.push({ ...sub, pr });
    }
  }
  return items;
}
