/**
 * Derive the matching closing tag for a header that is a single opening tag.
 *
 * `<nom>` → `</nom>`, `<a href="x">` → `</a>`. Returns `null` for anything that
 * is not a lone opening tag — plain text, a self-closing tag (`<br/>`), an
 * already-closing tag (`</nom>`), or several tags. Used to pre-fill the
 * per-entry `footer` of `concat.markdown` while it is still empty.
 *
 * Only the element name carries over: attributes belong on the opening tag, so
 * the closing tag drops them.
 */
export const closingTagFor = (header: string): string | null => {
  const trimmed = header.trim();
  const m = /^<([a-zA-Z][\w:-]*)(\s[^<>]*?)?>$/.exec(trimmed);
  if (!m) return null;
  const attrs = m[2] ?? "";
  if (attrs.trimEnd().endsWith("/")) return null; // self-closing → no closing tag
  return `</${m[1]}>`;
};
