// src/lib/adf.ts
// Flattens Atlassian Document Format (ADF) JIRA descriptions into plain
// text, specifically to pull the bullet list under a "## Acceptance
// Criteria" heading. Never regex the raw payload — ADF is a real nested
// document tree and headings/lists can appear in any order or not at all.

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
