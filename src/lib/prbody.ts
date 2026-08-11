// src/lib/prbody.ts
// Cleans a raw GitHub PR body down to the substantive, judge-facing signal.
// PR descriptions are the primary AC-coverage evidence at this org, but
// most bodies come from a review-tool template (see the create-bounce-pr
// skill) whose "Testing"/"Functionality Review" sections are pure
// scaffolding — repo/branch/command bracket fields, HTML-comment
// instructions, numbered manual-test steps. None of that is intent or
// completeness signal, so it's dropped; only Context/What changed/
// Summary/Description survive.

export type CleanedPrBody = {
  /** Cleaned, capped body text, or null if nothing substantive remained. */
  body: string | null;
  /** True if the cleaned body was longer than the cap and got truncated. */
  bodyTruncated: boolean;
  /** Set when cleaning left too little real content to be useful — the
   *  judge should fall back to title + file paths, not read this as "no
   *  information" (a filled-in PR with a genuinely short body would also
   *  produce a short result, but an unfilled template reliably produces
   *  near-nothing after stripping, which is what this signal captures). */
  bodySignal: "template_only" | null;
};

const MAX_BODY_LENGTH = 1500;
const MIN_REAL_CONTENT_LENGTH = 20;

/** Section headings whose content is substantive per this org's
 *  templates — everything else (Testing, Functionality Review, checklists,
 *  etc.) is scaffolding and gets dropped. Matched case-insensitively,
 *  as a whole-heading match (not substring) so e.g. "Testing Notes" isn't
 *  accidentally kept by a loose "test" match. */
const SUBSTANTIVE_HEADING_RE = /^(context|what changed|summary|description|changes|overview)$/i;

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function stripImageMarkdown(text: string): string {
  // ![alt](url) spans, and whole lines that are otherwise just a bare
  // image/screenshot link.
  return text
    .split("\n")
    .map((line) => line.replace(/!\[[^\]]*\]\([^)]*\)/g, ""))
    .join("\n");
}

function stripUncheckedChecklistLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*[-*]\s*\[\s?\]/.test(line))
    .join("\n");
}

/** A line that, aside from an optional list marker, is entirely a single
 *  bracket-wrapped span — e.g. "[Short paragraphs covering the relevant
 *  beats...]" or "- [Concise bullets describing what was done...]". This
 *  is exactly the shape of this org's unfilled template instructions and
 *  examples, as opposed to `[Yes]`/`[dashboard]` field values (which only
 *  ever appear inside the Testing section we already drop by heading). */
function isPlaceholderOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:[-*]|\d+\.)?\s*\[.+\]$/.test(trimmed);
}

function stripPlaceholderOnlyLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isPlaceholderOnlyLine(line))
    .join("\n");
}

function stripTrailingBotSignature(text: string): string {
  const lines = text.split("\n");
  while (lines.length > 0) {
    const last = (lines[lines.length - 1] ?? "").trim();
    const isBotLine =
      last === "" ||
      last === "---" ||
      /^🤖\s*generated with/i.test(last) ||
      /^co-authored-by:/i.test(last) ||
      /^generated with \[?claude/i.test(last);
    if (!isBotLine) break;
    lines.pop();
  }
  return lines.join("\n");
}

type Section = { heading: string; content: string };

function splitSections(text: string): Section[] {
  const headingRe = /^#{1,6}\s+(.*)$/;
  const sections: Section[] = [];
  let heading = "";
  let lines: string[] = [];

  for (const line of text.split("\n")) {
    const match = line.match(headingRe);
    if (match) {
      sections.push({ heading, content: lines.join("\n") });
      heading = (match[1] ?? "").trim();
      lines = [];
    } else {
      lines.push(line);
    }
  }
  sections.push({ heading, content: lines.join("\n") });
  return sections;
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  const cut = lastBreak > max * 0.5 ? slice.slice(0, lastBreak) : slice;
  return cut.trimEnd();
}

export function cleanPrBody(rawBody: string | null | undefined): CleanedPrBody {
  if (!rawBody || rawBody.trim().length === 0) {
    return { body: null, bodyTruncated: false, bodySignal: "template_only" };
  }

  let text = rawBody;
  text = stripHtmlComments(text);
  text = stripImageMarkdown(text);
  text = stripUncheckedChecklistLines(text);

  const sections = splitSections(text);
  const hasHeadings = sections.some((s) => s.heading !== "") || sections.length > 1;

  if (hasHeadings) {
    text = sections
      .filter((s) => SUBSTANTIVE_HEADING_RE.test(s.heading))
      .map((s) => ({ heading: s.heading, content: stripPlaceholderOnlyLines(s.content).trim() }))
      // A heading whose only content was unfilled placeholder text (or no
      // content at all) carries nothing — drop the heading too, not just
      // its content, so a stack of empty section titles can't masquerade
      // as real signal.
      .filter((s) => s.content.length > 0)
      .map((s) => (s.heading ? `### ${s.heading}\n${s.content}` : s.content))
      .join("\n\n");
  } else {
    // No headings at all: keep the whole (already-stripped) body verbatim.
    text = stripPlaceholderOnlyLines(text);
  }

  text = stripTrailingBotSignature(text);
  text = collapseBlankLines(text);

  if (text.length < MIN_REAL_CONTENT_LENGTH) {
    return { body: null, bodyTruncated: false, bodySignal: "template_only" };
  }

  if (text.length > MAX_BODY_LENGTH) {
    return { body: truncate(text, MAX_BODY_LENGTH), bodyTruncated: true, bodySignal: null };
  }

  return { body: text, bodyTruncated: false, bodySignal: null };
}
