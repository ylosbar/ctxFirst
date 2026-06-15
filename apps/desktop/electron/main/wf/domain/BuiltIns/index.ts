/**
 * Built-in artifact-kind descriptors, assembled from the per-kind defs in this
 * folder. Each entry is a fully-built {@link ArtifactKindDescriptor} — same
 * shape as plugin/user records — so the registry can serve every kind through a
 * single lookup. This module (the folder) is the source of truth for built-in
 * shapes.
 *
 * Three regimes coexist (per spec):
 *  - **Primitive scalar** = `{ value: T }` — `String`, `Number`, `Boolean`,
 *    and the refinements that extend `String` (`Url`, `Email`, `DateTime`,
 *    `LinearRef`).
 *  - **Envelope** = `{ format, body }` — opaque text with a declared format.
 *  - **Struct** = typed non-textual shape (e.g. `linear.fetch` output).
 *
 * To add a built-in: create a `<kind>.ts` here, then register it in
 * `BUILTIN_SCHEMAS` and `ORDERED_DEFS` below (a root before its refinements).
 */
import { z } from "zod";
import type { ArtifactKindDescriptor } from "../artifact-schema";
import type { ArtifactKind, BuiltinArtifactKind } from "../artifact";
import { computeStructuralHash } from "../artifact-schema-hash";
import type { BuiltinTypeDef } from "./def";
import { stringType } from "./string";
import { numberType } from "./number";
import { booleanType } from "./boolean";
import { urlType } from "./url";
import { emailType } from "./email";
import { dateTimeType } from "./date-time";
import { linearRefType } from "./linear-ref";
import { markdownType } from "./markdown";
import { jsonType } from "./json";
import { pathType } from "./path";
import { pathListType } from "./path-list";
import { markdownListType } from "./markdown-list";
import { runExportType } from "./run-export";

/**
 * The compiled Zod schemas for every built-in kind. Kept as an object literal
 * with `as const satisfies` so {@link ArtifactPayload} can infer payload shapes
 * via `z.infer` — each value keeps its precise schema type because it is read
 * straight off the per-kind def (no widening to `z.ZodTypeAny`). Downstream
 * runners and renderers rely on this for type-safe access.
 */
export const BUILTIN_SCHEMAS = {
  String: stringType.schema,
  Number: numberType.schema,
  Boolean: booleanType.schema,
  Url: urlType.schema,
  Email: emailType.schema,
  DateTime: dateTimeType.schema,
  LinearRef: linearRefType.schema,
  Markdown: markdownType.schema,
  Json: jsonType.schema,
  Path: pathType.schema,
  PathList: pathListType.schema,
  MarkdownList: markdownListType.schema,
  RunExport: runExportType.schema,
} as const satisfies Record<BuiltinArtifactKind, z.ZodTypeAny>;

/**
 * Concrete sample payloads — one per built-in kind. Surfaced read-only by the
 * `KindPreview` UI so authors can see the canonical shape without reading the
 * code. Each entry must satisfy its kind's compiled schema, asserted at boot
 * by the colocated test (`builtin-descriptors.test.ts`).
 */
export const BUILTIN_SAMPLES = {
  String: { value: "" },
  Number: { value: 0 },
  Boolean: { value: false },
  Url: { value: "https://example.com" },
  Email: { value: "user@example.com" },
  DateTime: { value: "2026-01-01T00:00:00Z" },
  LinearRef: { value: "ABC-123" },
  Markdown: { format: "markdown", body: "# Hello\n" },
  Json: { format: "json", body: "{}" },
  Path: { path: "/tmp/foo.txt" },
  PathList: {
    format: "path-list",
    paths: ["/tmp/foo.txt", "/tmp/bar.txt"],
  },
  MarkdownList: { format: "markdown-list", bodies: ["# A", "# B"] },
  RunExport: { format: "json", schemaVersion: 1, body: "{}" },
} as const satisfies Record<BuiltinArtifactKind, unknown>;

/**
 * Declaration order is load-bearing: (a) the kind picker groups refinements
 * under their parent in this order, and (b) `computeStructuralHash` folds in the
 * parent's hash, so a parent def must precede its refinements.
 */
const ORDERED_DEFS: ReadonlyArray<BuiltinTypeDef> = [
  // Primitive roots — built first so refinements can fold in their hash.
  stringType,
  numberType,
  booleanType,
  // Refinements of `String`.
  urlType,
  emailType,
  dateTimeType,
  linearRefType,
  // Envelope / struct kinds.
  markdownType,
  jsonType,
  pathType,
  pathListType,
  markdownListType,
  runExportType,
];

/**
 * The built-in payload schemas as full descriptors. Each is constructed once at
 * module load and reused for the lifetime of the process — no on-demand
 * synthesis. The fold over {@link ORDERED_DEFS} populates a local hash map so a
 * refinement can resolve its parent's hash (hence the load-bearing order).
 */
export const BUILTIN_DESCRIPTORS: ReadonlyArray<ArtifactKindDescriptor> = (() => {
  const hashes = new Map<ArtifactKind, string>();
  const resolveParentHash = (kind: ArtifactKind): string | null =>
    hashes.get(kind) ?? null;

  return ORDERED_DEFS.map((def) => {
    const simplifiedSchema = z.toJSONSchema(def.schema, {
      unrepresentable: "any",
    });
    const structuralHash = computeStructuralHash(
      { simplifiedSchema, extends: def.parent },
      resolveParentHash,
    );
    hashes.set(def.kind, structuralHash);
    return {
      kind: def.kind,
      id: def.kind,
      version: "v1",
      name: def.name,
      description: def.description,
      source: { kind: "builtin" },
      schema: def.schema,
      rawSchema: null,
      simplifiedSchema,
      sampleRaw: null,
      sample: BUILTIN_SAMPLES[def.kind],
      synthesized: false,
      extends: def.parent,
      structuralHash,
      markdownProjection: def.markdown
        ? { kind: "fn", render: def.markdown }
        : null,
      // Built-ins are always `v1` — no predecessor version to coerce from.
      coerceFrom: null,
    };
  });
})();

/** O(1) lookup by kind, populated once at module load. */
export const BUILTIN_DESCRIPTORS_BY_KIND: ReadonlyMap<
  string,
  ArtifactKindDescriptor
> = new Map(BUILTIN_DESCRIPTORS.map((d) => [d.kind, d]));
