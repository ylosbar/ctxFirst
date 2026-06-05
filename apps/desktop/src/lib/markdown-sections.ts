// Pure, renderer-only parser that splits a concatenated Markdown body into
// top-level "wrapped" sections. A `concat.markdown` step wraps each fragment in
// a pseudo-XML tag pair emitted alone on its own line (`<spec>` … `</spec>`,
// `<design_system>` … `</design_system>`, …). The viewer derives a tab bar from
// this split: a `Full` tab rendering the whole body, plus one tab per detected
// section rendering only its inner content. See
// `specs/markdown-artifact-section-tabs.md`.
//
// Strictly presentational: no React, no main/IPC coupling, content-driven so it
// works for any Markdown wrapped this way regardless of producer.

export type MarkdownSection = {
  /** Raw tag name, e.g. "design_system". */
  tag: string;
  /** Tab label (= tag, disambiguated by index when duplicated). */
  label: string;
  /** Inner content, trimmed. */
  content: string;
};

export type MarkdownSectionSplit = {
  /** The original body, unchanged. */
  full: string;
  sections: ReadonlyArray<MarkdownSection>;
};

// An opening tag is a line whose trimmed content is exactly `<tag>` (no
// attributes, no inline text). The capture is reused to build the matching
// closing pattern.
const OPEN_RE = /^<([A-Za-z][A-Za-z0-9_-]*)>$/;
const CLOSE_RE = /^<\/([A-Za-z][A-Za-z0-9_-]*)>$/;

/**
 * Split `markdown` into top-level tag-wrapped sections.
 *
 * Only first-level pairs are collected; a same-named tag nested inside a
 * section is matched by a depth counter and does not produce its own section.
 * An opening tag without a matching close is ignored (no partial section).
 * Interstitial text outside any section never becomes a tab — it stays visible
 * in `full`.
 */
export const splitTaggedSections = (
  markdown: string,
): MarkdownSectionSplit => {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  const tagCounts = new Map<string, number>();

  let i = 0;
  while (i < lines.length) {
    const open = OPEN_RE.exec(lines[i].trim());
    if (!open) {
      i += 1;
      continue;
    }
    const tag = open[1];

    // Find the matching close at the same level, tracking nested same-tag
    // opens with a depth counter.
    let depth = 1;
    let close = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const trimmed = lines[j].trim();
      const nestedOpen = OPEN_RE.exec(trimmed);
      if (nestedOpen && nestedOpen[1] === tag) {
        depth += 1;
        continue;
      }
      const nestedClose = CLOSE_RE.exec(trimmed);
      if (nestedClose && nestedClose[1] === tag) {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }

    if (close === -1) {
      // Orphan opening tag — ignore it and keep scanning past this line.
      i += 1;
      continue;
    }

    const content = lines.slice(i + 1, close).join("\n").trim();
    const seen = tagCounts.get(tag) ?? 0;
    tagCounts.set(tag, seen + 1);
    sections.push({
      tag,
      label: seen === 0 ? tag : `${tag} ${seen + 1}`,
      content,
    });
    // Resume after the closing tag — first level only.
    i = close + 1;
  }

  return { full: markdown, sections };
};
