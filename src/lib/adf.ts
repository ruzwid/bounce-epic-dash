// src/lib/adf.ts
// Flattens Atlassian Document Format (ADF) JIRA descriptions into plain
// text: the bullet list under an "Acceptance Criteria" heading, and the
// prose under whichever heading a ticket uses to say what it is for.
// Never regex the raw payload — ADF is a real nested document tree and
// headings/lists can appear in any order or not at all.

type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
};

function isAdfNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null && "type" in value;
}

/** Concatenates every text run within a node's subtree, ignoring marks
 *  (bold/italic/etc.) — we only want the words, not the formatting. */
function flattenText(node: AdfNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (!node.content) {
    return "";
  }
  return node.content.map(flattenText).join("");
}

function isHeading(node: AdfNode): boolean {
  return node.type === "heading";
}

function isListNode(node: AdfNode): boolean {
  return node.type === "bulletList" || node.type === "orderedList";
}

/** One bullet's plain text per top-level listItem in a bulletList/orderedList. */
function listItemTexts(listNode: AdfNode): string[] {
  return (listNode.content ?? [])
    .filter((item) => item.type === "listItem")
    .map((item) => flattenText(item).trim())
    .filter((text) => text.length > 0);
}

/** Extracts the bullet text under a "## Acceptance Criteria" heading (case
 *  insensitive, any heading level) in a JIRA ADF description. Returns []
 *  — never throws — when the doc is missing, malformed, or has no such
 *  section, per spec: "If a parent has no AC section, record that and
 *  continue; do not fail." */
export function extractAcBullets(doc: unknown): string[] {
  if (!isAdfNode(doc) || !Array.isArray(doc.content)) {
    return [];
  }

  const topLevel = doc.content;
  const acHeadingIndex = topLevel.findIndex(
    (node) => isHeading(node) && /acceptance criteria/i.test(flattenText(node)),
  );
  if (acHeadingIndex === -1) {
    return [];
  }

  const bullets: string[] = [];
  for (let i = acHeadingIndex + 1; i < topLevel.length; i++) {
    const node = topLevel[i];
    if (!node) continue;
    if (isHeading(node)) {
      // Reached the next section — stop collecting.
      break;
    }
    if (isListNode(node)) {
      bullets.push(...listItemTexts(node));
    }
  }
  return bullets;
}

/** Headings a ticket uses to state its purpose, in preference order.
 *  Epics and features lead with "Goal"; milestones lead with "What it
 *  delivers", except M3 which also uses "Goal" — so both are matched
 *  rather than assuming a heading per issue type. */
const OVERVIEW_HEADINGS = /^\s*(goal|what it delivers|overview|summary|purpose)\s*$/i;

/** Every paragraph in `nodes` from `start` until the next heading. */
function paragraphsFrom(nodes: AdfNode[], start: number): string[] {
  const paragraphs: string[] = [];
  for (let i = start; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    if (isHeading(node)) break;
    if (node.type === "paragraph") {
      const text = flattenText(node).trim();
      if (text.length > 0) paragraphs.push(text);
    }
  }
  return paragraphs;
}

/**
 * The ticket's own statement of what it is for: the prose under its
 * "Goal" / "What it delivers" heading, falling back to whatever
 * paragraphs open the description.
 *
 * Deliberately an extraction and not a summary. The text is already
 * written by a human and already short — running it past a model every
 * run would spend tokens to make a static sentence less accurate. Returns
 * "" — never throws — when the description is missing or has no prose,
 * on the same "record it and continue" principle as extractAcBullets.
 */
export function extractOverview(doc: unknown): string {
  if (!isAdfNode(doc) || !Array.isArray(doc.content)) {
    return "";
  }

  const topLevel = doc.content;
  const headingIndex = topLevel.findIndex(
    (node) => isHeading(node) && OVERVIEW_HEADINGS.test(flattenText(node)),
  );

  // No recognised heading: take the paragraphs before the first heading,
  // which is where a ticket with no template puts its description.
  const paragraphs = headingIndex === -1 ? paragraphsFrom(topLevel, 0) : paragraphsFrom(topLevel, headingIndex + 1);

  return paragraphs.join("\n\n");
}
