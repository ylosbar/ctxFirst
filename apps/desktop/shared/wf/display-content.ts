/**
 * Pulls the human-displayable text out of an artifact's on-disk JSON
 * envelope. For text envelopes returns `body`; for plugin records that
 * pre-render Markdown (e.g. `plugin:linear:Ticket@v1`) returns
 * `renderedMarkdown`; for single-string structs returns the lone field. Falls
 * back to the raw content if it isn't JSON (pre-migration artifacts) or
 * doesn't match any known shape.
 *
 * A `Json` envelope (`{ format: "json", body }`) carries an LLM-produced JSON
 * document — frequently minified onto a single line, or wrapped in a
 * ```` ```json ```` fence. We normalise it to pretty-printed JSON so it is
 * human-readable both in the artifact panel (where it then parses into the
 * structured "Lisible" view) and in the line-by-line human-review surface.
 * This is purely a read-time projection — the stored bytes are untouched, so
 * `format.validate` / `json.transform` still see the original payload. Because
 * both the review viewer and the server-side comment renderer anchor on this
 * same string, line anchors stay valid on both sides.
 */
const FENCED_JSON = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;

const prettyJsonBody = (body: string): string => {
  const trimmed = body.trim();
  const fence = FENCED_JSON.exec(trimmed);
  const candidate = (fence ? fence[1] : trimmed).trim();
  // Only normalise a body that is *entirely* a single JSON object/array;
  // anything with surrounding prose is left exactly as authored.
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return body;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed === null || typeof parsed !== "object") return body;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
};

export const extractDisplayableContent = (raw: string): string => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.body === "string") {
        return obj.format === "json" ? prettyJsonBody(obj.body) : obj.body;
      }
      if (typeof obj.renderedMarkdown === "string") return obj.renderedMarkdown;
      if (typeof obj.value === "string") return obj.value;
      if (typeof obj.path === "string") return obj.path;
      if (typeof obj.ref === "string") return obj.ref;
    }
  } catch {
    // Not JSON — fall through.
  }
  return raw;
};
