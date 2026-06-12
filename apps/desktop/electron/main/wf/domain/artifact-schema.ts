/**
 * Domain types for artifact kind descriptors — the unified shape that
 * built-ins, user types (UI → `wf_artifact_schemas` table) and plugin types
 * (manifest `contributions.artifactSchemas`) all share. The registry
 * (`ArtifactSchemaRegistry`) is the only lookup path; the legacy parallel
 * built-in table has been retired. Cf. PLUGINS.md §6.
 *
 * Dynamic schemas are stored as **JSON Schema** (portable, lib-mature, easy
 * to codegen from a sample) and compiled to a Zod schema at the first
 * `resolve()` (cached on the descriptor for the lifetime of the record).
 */
import type { z } from "zod";
import type { ArtifactMarkdownProjection } from "@shared/wf/render-artifact-markdown";
import type { ArtifactKind, PluginArtifactKind, UserArtifactKind } from "./artifact";
import type { CoerceFrom } from "./artifact-coercion";

export type { ArtifactMarkdownProjection };

/**
 * Reference to an artifact type. Stable across versions: a record with
 * `(id, version)` is immutable; bumping the schema means publishing a new
 * version with the same `id`.
 */
export type ArtifactSchemaRef = {
  id: string;
  version: string;
};

/** Origin of an artifact-kind descriptor. Drives editability in the UI. */
export type ArtifactSchemaSource =
  | { kind: "builtin" }
  | { kind: "plugin"; pluginId: string }
  | { kind: "user" };

/**
 * Unified descriptor for an artifact kind. Built-ins are seeded in
 * `BUILTIN_DESCRIPTORS`; user types come from `wf_artifact_schemas`;
 * plugin types come from the loader's manifest contributions.
 *
 * The descriptor is the registry's atomic unit: `resolve(kind)` returns one
 * (or `null`). `parseArtifact` consumes `schema`, the kind picker consumes
 * `name`/`description`, the editor consumes `rawSchema`/`simplifiedSchema`.
 */
export type ArtifactKindDescriptor = {
  /** Canonical kind string — the value carried by IPC, events, storageRef. */
  kind: ArtifactKind;
  /**
   * Logical id of the schema. For built-ins equal to {@link kind}; for
   * dynamics, the user-/plugin-provided id. Kept on the record so listings
   * and editors can group versions without re-parsing the kind string.
   */
  id: string;
  /** Logical version. For built-ins always `"v1"`. */
  version: string;
  /** Human name for the kind picker / UI badges. */
  name: string;
  description: string;
  source: ArtifactSchemaSource;
  /** Compiled Zod schema for the simplified payload. Used by `parseArtifact`. */
  schema: z.ZodTypeAny;
  /** JSON Schema describing the raw payload (optional, parser playground). */
  rawSchema: unknown | null;
  /** JSON Schema describing the simplified payload (what runners produce). */
  simplifiedSchema: unknown;
  /** Optional sample of the raw payload — used by the parser playground. */
  sampleRaw: string | null;
  /**
   * Concrete example payload conforming to {@link schema}. Surfaced read-only
   * by the kind-picker UI as a discoverability cue (`KindPreview` component).
   * `null` lets the renderer auto-derive a best-effort sample from
   * {@link simplifiedSchema} — used for stored user records that pre-date
   * sample seeding and for plugin contributions that omit a sample.
   */
  sample: unknown | null;
  /**
   * `true` for descriptors built on demand (parametric kinds in later
   * spec stages: `List<T>`, `OneOf<…>`). Always `false` in §0.
   */
  synthesized: boolean;
  /**
   * Name of the super-type for refinement (§2). A port accepting `extends`
   * also accepts this kind (covariance); the inverse requires a re-validation
   * (cast step). `null` for primitive roots and for records without a parent.
   *
   * Cycles are forbidden by construction; `portAccepts` guards against
   * corrupted registries with a `seen` set on the resolved chain.
   */
  extends: ArtifactKind | null;
  /**
   * SHA-256 of the descriptor's normalised structure (§5). Two records that
   * collapse to the same hash are considered the same type by `portAccepts`,
   * regardless of `(id, version)` or source — so a user-published record with
   * the same shape as a plugin record can feed a port typed against either.
   *
   * Derivation:
   *  - Leaf descriptors (built-in, user, plugin) hash their `simplifiedSchema`
   *    folded with their refinement parent's hash.
   *  - Synthesised parametric kinds (`List<T>`, `OneOf<…>`, `Success<T>`,
   *    `Error<E>`) hash a tagged composition of the inner descriptor(s)'
   *    hashes — for `OneOf`, variant hashes are sorted so the identity is
   *    set-based (matches `portAccepts`).
   *
   * Cf. `artifact-schema-hash.ts` for the canonical-JSON contract.
   */
  structuralHash: string;
  /**
   * Markdown projection of this kind's payload (cf.
   * `specs/typed-kind-rendered-markdown.md`).
   *  - `{ kind: "fn" }`       — built-in / plugin: pure main-side function.
   *  - `{ kind: "template" }` — `user` kind: `{{field}}` gabarit from the schema.
   * `null`/absent ⇒ the deterministic fallback chain in
   * {@link renderArtifactMarkdown} (embedded `renderedMarkdown`, text `body`,
   * or pretty-printed JSON). **Never serialised to the renderer** — the `fn`
   * variant cannot cross the IPC boundary; the projection is always resolved
   * main-side and only the produced string is shipped.
   */
  markdownProjection: ArtifactMarkdownProjection | null;
  /**
   * Read-time coercion declaration (§2.4, P3). When present, a payload written
   * under the same logical `id` at `coerceFrom.fromVersion` is reshaped by the
   * declarative patch before validation against this descriptor's schema — the
   * Avro reader-vs-writer bridge, constrained to a single adjacent same-`id`
   * step. `null`/absent for the vast majority of descriptors (built-ins are
   * always `v1`, so they never have a predecessor to coerce from).
   *
   * Orthogonal to {@link structuralHash}: a coercion declaration is read-side
   * metadata, never folded into identity (adding one must not change the type).
   */
  coerceFrom: CoerceFrom | null;
};

/**
 * Back-compat alias: use cases and adapters already speak of
 * `ArtifactSchemaRecord`. A pure rename to `ArtifactKindDescriptor` is a
 * follow-up — the alias keeps churn minimal in this PR.
 */
export type ArtifactSchemaRecord = ArtifactKindDescriptor;

/**
 * Payload accepted by `ArtifactSchemaRegistry.save()` — only user types are
 * editable; the adapter rejects calls trying to write a builtin/plugin record.
 */
export type SaveUserArtifactSchema = {
  id: string;
  version: string;
  name: string;
  description?: string;
  rawSchema?: unknown | null;
  simplifiedSchema: unknown;
  sampleRaw?: string | null;
  /**
   * Optional explicit sample payload for the kind-picker preview. Omitted
   * (`undefined`) leaves the column NULL and lets the renderer auto-derive
   * from `simplifiedSchema`; passing `null` is equivalent.
   */
  sample?: unknown | null;
  /** Super-type for refinement (§2). `null`/omitted for root records. */
  extends?: ArtifactKind | null;
  /**
   * Optional `{{field}}` Markdown gabarit for this kind, persisted in the
   * `markdown_template` column. Mapped to a `{ kind: "template" }` projection
   * on resolve; `null`/omitted ⇒ no projection (fallback chain).
   */
  markdownTemplate?: string | null;
  /**
   * Read-time coercion declaration (§2.4, P3): names a same-`id` predecessor
   * version and a declarative patch that upgrades its payloads to this
   * version's shape at read time. Persisted in the `coerce_from_json` column.
   * `null`/omitted ⇒ no coercion. Typically set on a `@vNext` bump alongside a
   * mechanical reshape (e.g. `rename summary → abstract`).
   */
  coerceFrom?: CoerceFrom | null;
  /**
   * Escape hatch for the BACKWARD-compatibility gate (§2.3). When an in-place
   * overwrite at the same `(id, version)` would reject payloads valid under the
   * stored schema, the registry throws unless this is `true`. Not persisted;
   * it only authorises the single save it rides on. Bumping to a new version is
   * the preferred path — this is for deliberate breaking redesigns.
   */
  allowBreaking?: boolean;
};

/** Encodes a `(id, version)` ref into the `user:` artifact kind string. */
export const toUserArtifactKind = (
  ref: ArtifactSchemaRef,
): UserArtifactKind => `user:${ref.id}@${ref.version}`;

/** Encodes a `(pluginId, id, version)` ref into the `plugin:` artifact kind. */
export const toPluginArtifactKind = (
  pluginId: string,
  ref: ArtifactSchemaRef,
): PluginArtifactKind =>
  `plugin:${pluginId}:${ref.id}@${ref.version}`;
