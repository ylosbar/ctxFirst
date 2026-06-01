/**
 * Helpers that convert between the **on-disk wire format** of an artifact
 * (JSON string conforming to the descriptor's schema) and the **typed payload**
 * runners and consumers work with.
 *
 *  - {@link serializeFromString} — turns a raw string (LLM output / pasted
 *    spec / extracted value) into a typed payload for the given kind.
 *  - {@link plainFallback} — reads a pre-migration artifact (string stored
 *    without `payloadFormat: "json-v1"`) and *attempts* to reconstruct a
 *    payload matching the current schema. Used in log-only / rollback modes.
 *
 * Built-in dispatch is by `isBuiltinArtifactKind` (a Set lookup, not a map
 * subscript). Dynamic kinds (`user:`, `plugin:`) route through `JSON.parse`
 * since their wire form is the JSON-encoded simplified payload.
 */
import { isBuiltinArtifactKind, type ArtifactKind, type BuiltinArtifactKind } from "./artifact";
import type { ArtifactPayload } from "./parse-artifact";

const serializeBuiltinFromString = (
  kind: BuiltinArtifactKind,
  raw: string,
): ArtifactPayload<BuiltinArtifactKind> => {
  switch (kind) {
    case "Markdown":
      return { format: "markdown", body: raw };
    case "Json":
      return { format: "json", body: raw };
    // Primitive roots and `String` refinements share the `{ value }` shape.
    // The Zod schema decides whether `raw` actually parses (e.g. an `Email`
    // refinement rejects a non-email value at `parseArtifact` time).
    case "String":
    case "Url":
    case "Email":
    case "DateTime":
    case "LinearRef":
      return { value: raw.trim() };
    case "Number": {
      const n = Number(raw.trim());
      if (Number.isNaN(n)) {
        throw new Error(`Cannot parse "${raw}" as Number`);
      }
      return { value: n };
    }
    case "Boolean": {
      const trimmed = raw.trim().toLowerCase();
      if (trimmed === "true") return { value: true };
      if (trimmed === "false") return { value: false };
      throw new Error(`Cannot parse "${raw}" as Boolean (expected true|false)`);
    }
    case "Path":
      return { path: raw.trim() };
    case "PathList":
      return {
        format: "path-list",
        paths: raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      };
    case "MarkdownList":
      return {
        format: "markdown-list",
        bodies: raw.length === 0 ? [] : [raw],
      };
    case "RunExport":
      throw new Error(
        "RunExport cannot be derived from a string — use the export_run step",
      );
  }
};

/**
 * Wraps a raw string into the payload shape required by the schema of `kind`.
 *
 *  - Built-in kinds: explicit per-kind shape (markdown envelope, struct, …).
 *  - Dynamic kinds (`user:` / `plugin:`): the raw is treated as JSON-encoded
 *    payload — runners feeding a dynamic kind are expected to hand us the
 *    serialized JSON of the structured payload. If `raw` is not parseable,
 *    we surface a clear error.
 *
 * Throws when a dynamic kind's wire form (JSON) cannot be parsed from `raw`.
 */
export const serializeFromString = (
  kind: ArtifactKind,
  raw: string,
): ArtifactPayload<ArtifactKind> => {
  if (isBuiltinArtifactKind(kind)) {
    return serializeBuiltinFromString(kind, raw);
  }
  try {
    return JSON.parse(raw) as ArtifactPayload<ArtifactKind>;
  } catch (err) {
    throw new Error(
      `Cannot serialize string into kind "${kind}": payload must be JSON. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

/**
 * Best-effort reconstruction of a payload from a pre-migration artifact whose
 * content is a raw string (no `payloadFormat: "json-v1"`). May still produce
 * a value that fails the kind's schema — callers must run `parseArtifact`
 * afterwards to confirm.
 *
 * Struct kinds (e.g. the linear plugin's `Ticket`) cannot be rebuilt from
 * rendered text and surface the underlying JSON parse error from
 * {@link serializeFromString} — callers are expected to surface a clear error
 * and re-emit the artifact via its source step.
 */
export const plainFallback = (
  kind: ArtifactKind,
  content: string,
): ArtifactPayload<ArtifactKind> => serializeFromString(kind, content);

export { extractDisplayableContent } from "@shared/wf/display-content";
