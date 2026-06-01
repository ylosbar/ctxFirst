/**
 * Best-effort generator of a sample payload from a JSON Schema. Used by the
 * `KindPreview` UI as a fallback when a descriptor's explicit `sample` is
 * `null` (typically: user records persisted before sample seeding, plugin
 * contributions that omit the field).
 *
 * Trade-offs:
 *  - Targets *readability*, not strict validity. Generated samples may not
 *    satisfy every advanced constraint (regex, minimum, etc.) — the preview
 *    surfaces a note to that effect when a derived sample is shown.
 *  - Returns `undefined` for unknown leaves (allowing the caller to skip the
 *    property). The renderer treats `null` at the top level as "no sample".
 *  - Required object properties get a derived value; optional ones are
 *    omitted so the preview stays concise.
 */

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const stringForFormat = (format: unknown): string => {
  if (typeof format !== "string") return "";
  switch (format) {
    case "url":
    case "uri":
      return "https://example.com";
    case "email":
      return "user@example.com";
    case "date-time":
      return "2026-01-01T00:00:00Z";
    case "date":
      return "2026-01-01";
    case "uuid":
      return "00000000-0000-0000-0000-000000000000";
    default:
      return "";
  }
};

const deriveNode = (node: unknown): unknown => {
  if (!isObject(node)) return null;

  if ("const" in node) return node["const"];
  if (Array.isArray(node["enum"]) && node["enum"].length > 0) {
    return node["enum"][0];
  }

  if (Array.isArray(node["oneOf"]) && node["oneOf"].length > 0) {
    return deriveNode((node["oneOf"] as ReadonlyArray<unknown>)[0]);
  }
  if (Array.isArray(node["anyOf"]) && node["anyOf"].length > 0) {
    return deriveNode((node["anyOf"] as ReadonlyArray<unknown>)[0]);
  }

  // `$kind`: caller would need access to the registry to inline a sub-sample.
  // We return `null` so the caller can decide; the renderer leaves the slot
  // empty (the shape projection covers the discoverability need).
  if (typeof node["$kind"] === "string") return null;

  const type = node["type"];
  if (type === "string") return stringForFormat(node["format"]);
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;

  if (type === "array") {
    const items = deriveNode(node["items"]);
    return [items];
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
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!required.has(k)) continue;
      out[k] = deriveNode(v);
    }
    return out;
  }

  return null;
};

/**
 * Generates a best-effort sample payload from a JSON Schema. See module
 * docstring for trade-offs. Returns `null` for inputs the helper cannot
 * meaningfully render (top-level non-object, malformed nodes).
 */
export const deriveKindSample = (schema: unknown): unknown => deriveNode(schema);
