/**
 * Pure, deterministic Markdown projection of a typed artifact payload.
 *
 * Every `ArtifactKindDescriptor` may carry a {@link ArtifactMarkdownProjection}
 * — a `fn` for built-in/plugin kinds (main-side code) or a `template` string for
 * `user` kinds (stored in the schema, rendered through the existing `{{field}}`
 * placeholder engine). The projection never crosses the IPC boundary: it is
 * always resolved **main-side** (the function variant cannot be serialised),
 * and the renderer only ever receives the produced string.
 *
 * {@link renderArtifactMarkdown} centralises a fallback chain so a structured
 * kind without an explicit projection stays human-readable (it pretty-prints
 * the JSON payload) and never throws. Cf.
 * `specs/typed-kind-rendered-markdown.md`.
 */
import { renderTemplate } from "./placeholders";

export type ArtifactMarkdownProjection =
  | { kind: "fn"; render: (payload: unknown) => string }
  | { kind: "template"; template: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Projects the top-level scalar fields of `payload` into a `Map<string,string>`
 * for {@link renderTemplate}. Strings pass through verbatim; numbers/booleans
 * are stringified; nested objects/arrays/null are JSON-encoded. This flat
 * substitution is the documented v1 limit for `user` templates (no iteration);
 * richer projections go through a plugin `fn`.
 */
export const flattenPayload = (
  payload: unknown,
): Map<string, string> => {
  const out = new Map<string, string>();
  if (!isRecord(payload)) return out;
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      out.set(key, value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out.set(key, String(value));
    } else {
      out.set(key, JSON.stringify(value));
    }
  }
  return out;
};

/**
 * Resolves the Markdown projection of an artifact payload with a deterministic
 * fallback chain:
 *  1. explicit `fn` projection (built-in / plugin);
 *  2. explicit `template` projection (user kind), via the `{{field}}` engine;
 *  3. embedded `renderedMarkdown` string (the `linear:Ticket` pattern, kept
 *     for backward-compat);
 *  4. text envelope `body` (`Markdown` / `Json` / …) returned as-is;
 *  5. last resort — a fenced pretty-printed JSON block (the "Brut" view).
 *
 * `projection` may be `null` (kind unknown or carries no projection).
 */
export const renderArtifactMarkdown = (
  projection: ArtifactMarkdownProjection | null,
  payload: unknown,
): string => {
  if (projection?.kind === "fn") return projection.render(payload);
  if (projection?.kind === "template") {
    return renderTemplate(projection.template, flattenPayload(payload), {
      onMissing: "empty",
    }).output;
  }
  if (isRecord(payload) && typeof payload.renderedMarkdown === "string") {
    return payload.renderedMarkdown;
  }
  if (isRecord(payload) && typeof payload.body === "string") {
    return payload.body;
  }
  return "```json\n" + JSON.stringify(payload, null, 2) + "\n```";
};
