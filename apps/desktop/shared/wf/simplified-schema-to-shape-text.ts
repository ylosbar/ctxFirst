/**
 * Pure, display-only projection of a JSON Schema (the `simplifiedSchema` carried
 * by every `ArtifactKindDescriptor` / `ArtifactSchemaView`) to a one-line
 * TS-like text — the discoverability cue rendered by the `KindPreview` UI so
 * authors can see the shape of a kind without reading the descriptor code.
 *
 * Fail-open by design: unknown nodes render as `unknown` rather than throw, so
 * an evolution of the underlying JSON Schema dialect (new keywords) downgrades
 * gracefully to a partial preview instead of crashing the picker.
 *
 * Lives in `shared/` so both the renderer (`KindPreview`) and the main side
 * (snapshot tests) project through the same function.
 */

const DEFAULT_MAX_DEPTH = 3;

export type ShapeRenderOptions = {
  /** Max depth before short-circuiting to `…`. Default {@link DEFAULT_MAX_DEPTH}. */
  readonly maxDepth?: number;
  /**
   * Resolves a `$kind` reference or a referenced record (user/plugin) to a
   * sub-shape text. Returning `null` means "show the kind name as-is".
   * The renderer typically passes a closure that reads `useArtifactSchemas()`
   * and is allowed to recurse exactly once — every nested `$kind` past that
   * point short-circuits to its bare name to avoid `List<List<…>>` blow-up.
   */
  readonly resolve?: (kind: string) => string | null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const renderConst = (value: unknown): string => JSON.stringify(value) ?? "unknown";

const renderEnum = (values: ReadonlyArray<unknown>): string =>
  values.map((v) => JSON.stringify(v) ?? "unknown").join(" | ");

const stringFormatSuffix = (format: unknown): string => {
  if (typeof format !== "string" || format.length === 0) return "";
  // `date-time` is the JSON Schema canonical name; the rest go through verbatim
  // (`url`, `email`, custom plugin formats…) so plugin-declared refinements get
  // a visual cue too.
  const label = format === "date-time" ? "date-time" : format;
  return ` /* ${label} */`;
};

const renderNode = (
  node: unknown,
  depth: number,
  opts: Required<ShapeRenderOptions>,
): string => {
  if (depth > opts.maxDepth) return "…";
  if (!isObject(node)) return "unknown";

  // `$kind` short-circuit — resolver decides whether to inline or print the
  // bare kind name.
  const kindRef = node["$kind"];
  if (typeof kindRef === "string") {
    const resolved = opts.resolve(kindRef);
    return resolved ?? kindRef;
  }

  // `const` and `enum` first — they shadow `type` when present.
  if ("const" in node) return renderConst(node["const"]);
  if (Array.isArray(node["enum"]) && node["enum"].length > 0) {
    return renderEnum(node["enum"]);
  }

  if (Array.isArray(node["oneOf"]) && node["oneOf"].length > 0) {
    return (node["oneOf"] as ReadonlyArray<unknown>)
      .map((v) => renderNode(v, depth + 1, opts))
      .join(" | ");
  }
  if (Array.isArray(node["anyOf"]) && node["anyOf"].length > 0) {
    return (node["anyOf"] as ReadonlyArray<unknown>)
      .map((v) => renderNode(v, depth + 1, opts))
      .join(" | ");
  }

  const type = node["type"];
  if (type === "string") return `string${stringFormatSuffix(node["format"])}`;
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "null") return "null";

  if (type === "array") {
    const items = renderNode(node["items"], depth + 1, opts);
    return `${items}[]`;
  }

  if (type === "object") {
    const props = (node["properties"] ?? {}) as Record<string, unknown>;
    const required = new Set(
      Array.isArray(node["required"])
        ? (node["required"] as ReadonlyArray<unknown>).filter(
            (v): v is string => typeof v === "string",
          )
        : [],
    );
    const entries = Object.entries(props);
    if (entries.length === 0) return "{}";
    const parts = entries.map(([k, v]) => {
      const opt = required.has(k) ? "" : "?";
      return `${k}${opt}: ${renderNode(v, depth + 1, opts)}`;
    });
    return `{ ${parts.join(", ")} }`;
  }

  return "unknown";
};

/**
 * Projects a JSON Schema-shaped value to a one-line TS-like text. See module
 * docstring for behaviour. Stable, deterministic, no allocations beyond the
 * returned string and intermediate joins.
 */
export const simplifiedSchemaToShapeText = (
  schema: unknown,
  opts: ShapeRenderOptions = {},
): string =>
  renderNode(schema, 0, {
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    resolve: opts.resolve ?? (() => null),
  });
