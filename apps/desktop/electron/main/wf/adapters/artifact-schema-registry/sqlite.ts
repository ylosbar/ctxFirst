/**
 * SQLite-backed {@link ArtifactSchemaRegistry}. Merges three sources at lookup:
 *  1. **Built-ins** — seeded once from `BUILTIN_DESCRIPTORS` at construction.
 *     Each descriptor already carries its compiled Zod schema and JSON
 *     Schema; lookup is O(1) via `BUILTIN_DESCRIPTORS_BY_KIND`.
 *  2. **Plugin contributions** — pushed in via `setPluginContributions` by the
 *     composition root after the loader has run. Kept in memory; never
 *     persisted to SQLite (plugins are the source of truth on disk).
 *  3. **User rows** — stored in `wf_artifact_schemas`, only ones that can be
 *     `save`/`remove`d through this registry.
 *
 * The Zod schema lives on every descriptor: built-ins are pre-compiled, user
 * and plugin records compile from JSON Schema lazily and cache on the
 * descriptor for the lifetime of the entry.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import type {
  ArtifactSchemaRegistry,
  PluginArtifactSchemaContribution,
} from "../../application/ports/outbound/artifact-schema-registry";
import {
  isBuiltinArtifactKind,
  isContainerArtifactKind,
  isContentAddressedArtifactKind,
  isErrorArtifactKind,
  isSuccessArtifactKind,
  isSumArtifactKind,
  parseContentAddressedArtifactKind,
  parseDynamicArtifactKind,
  parseErrorArtifactKind,
  parseListArtifactKind,
  parseSuccessArtifactKind,
  parseSumArtifactKind,
  type ArtifactKind,
} from "../../domain/artifact";
import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../../domain/artifact-errors";
import {
  BUILTIN_DESCRIPTORS_BY_KIND,
} from "../../domain/BuiltIns";
import {
  composeListStructuralHash,
  composeSumStructuralHash,
  composeWrapperStructuralHash,
  computeStructuralHash,
} from "../../domain/artifact-schema-hash";
import { parseArtifact } from "../../domain/parse-artifact";
import { plainFallback } from "../../domain/artifact-serializer";
import {
  toPluginArtifactKind,
  toUserArtifactKind,
  type ArtifactKindDescriptor,
  type ArtifactSchemaRecord,
  type ArtifactSchemaRef,
  type SaveUserArtifactSchema,
} from "../../domain/artifact-schema";
import { bindChannel, channelScopeWhere } from "../_shared/channel-scope";

type Deps = { db: Database.Database; channels: ChannelContext };

type Row = {
  id: string;
  version: string;
  name: string;
  description: string;
  raw_schema_json: string | null;
  simplified_schema_json: string;
  sample_raw: string | null;
  sample_json: string | null;
  extends_kind: string | null;
  structural_hash: string | null;
  markdown_template: string | null;
};

/**
 * Resolver shape used by the local hash-derivation paths: takes a kind and
 * returns its structural hash. Used to fold a refinement parent's hash into
 * a child's identity (§5). Returns `null` when the parent isn't resolvable
 * — `computeStructuralHash` treats that as "no parent" without throwing, so
 * a transient missing dep degrades gracefully (the hash will rebind once the
 * parent is loaded; the affected child is `null`-parented in the meantime).
 */
type HashResolver = (kind: ArtifactKind) => string | null;

/**
 * Builds a user-record descriptor from a SQLite row. Compiles the JSON Schema
 * into Zod once — callers reuse `descriptor.schema` directly. The structural
 * hash is read from the column when present; on rows still NULL after the v24
 * migration the caller computes it via {@link backfillUserHashes} before
 * descriptors leak out of the adapter.
 */
const rowToRecord = (
  row: Row,
  resolveParentHash: HashResolver,
): ArtifactKindDescriptor => {
  const simplifiedSchema = JSON.parse(row.simplified_schema_json);
  const extendsKind = (row.extends_kind ?? null) as ArtifactKind | null;
  const structuralHash =
    row.structural_hash ??
    computeStructuralHash(
      { simplifiedSchema, extends: extendsKind },
      resolveParentHash,
    );
  return {
    kind: toUserArtifactKind({ id: row.id, version: row.version }),
    id: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    rawSchema: row.raw_schema_json ? JSON.parse(row.raw_schema_json) : null,
    simplifiedSchema,
    sampleRaw: row.sample_raw,
    // `null` means "no explicit sample stored"; the renderer's `KindPreview`
    // falls back to `deriveKindSample(simplifiedSchema)`.
    sample: row.sample_json ? JSON.parse(row.sample_json) : null,
    source: { kind: "user" },
    schema: z.fromJSONSchema(simplifiedSchema as never),
    synthesized: false,
    extends: extendsKind,
    structuralHash,
    markdownProjection: row.markdown_template
      ? { kind: "template", template: row.markdown_template }
      : null,
  };
};

const pluginContribToRecord = (
  pluginId: string,
  t: PluginArtifactSchemaContribution["types"][number],
  resolveParentHash: HashResolver,
): ArtifactKindDescriptor => {
  const extendsKind = (t.extends ?? null) as ArtifactKind | null;
  return {
    kind: toPluginArtifactKind(pluginId, { id: t.id, version: t.version }),
    id: t.id,
    version: t.version,
    name: t.name,
    description: t.description ?? "",
    rawSchema: t.rawSchema ?? null,
    simplifiedSchema: t.simplifiedSchema,
    sampleRaw: t.sampleRaw ?? null,
    sample: t.sample ?? null,
    source: { kind: "plugin", pluginId },
    schema: z.fromJSONSchema(t.simplifiedSchema as never),
    synthesized: false,
    extends: extendsKind,
    structuralHash: computeStructuralHash(
      { simplifiedSchema: t.simplifiedSchema, extends: extendsKind },
      resolveParentHash,
    ),
    markdownProjection: t.markdownTemplate
      ? { kind: "template", template: t.markdownTemplate }
      : null,
  };
};

export const createSqliteArtifactSchemaRegistry = (
  { db, channels }: Deps,
): ArtifactSchemaRegistry => {
  // `selectAll` here is channel-scoped: it powers user listings, never lookup.
  // The `findUserRecord` / `findUserRow` paths use the same query so plugin
  // and built-in resolution still bypass the channel filter (those records
  // don't live in DB anyway).
  const selectAll = db.prepare(
    `SELECT id, version, name, description, raw_schema_json, simplified_schema_json, sample_raw, sample_json, extends_kind, structural_hash, markdown_template
       FROM wf_artifact_schemas
      WHERE ${channelScopeWhere}
      ORDER BY id ASC, version ASC`,
  );
  // `selectAllUnscoped` is used by `resolve`/`getSchema` lookups: a step that
  // references a user type from another channel must still resolve.
  const selectAllUnscoped = db.prepare(
    `SELECT id, version, name, description, raw_schema_json, simplified_schema_json, sample_raw, sample_json, extends_kind, structural_hash, markdown_template
       FROM wf_artifact_schemas
      ORDER BY id ASC, version ASC`,
  );
  const upsert = db.prepare(
    `INSERT INTO wf_artifact_schemas (
       id, version, name, description, raw_schema_json,
       simplified_schema_json, sample_raw, sample_json, extends_kind, structural_hash,
       markdown_template, channel_id, created_at
     ) VALUES (
       @id, @version, @name, @description, @raw_schema_json,
       @simplified_schema_json, @sample_raw, @sample_json, @extends_kind, @structural_hash,
       @markdown_template, @channel_id, @now
     )
     ON CONFLICT(id, version) DO UPDATE SET
       name                   = excluded.name,
       description            = excluded.description,
       raw_schema_json        = excluded.raw_schema_json,
       simplified_schema_json = excluded.simplified_schema_json,
       sample_raw             = excluded.sample_raw,
       sample_json            = excluded.sample_json,
       extends_kind           = excluded.extends_kind,
       structural_hash        = excluded.structural_hash,
       markdown_template      = excluded.markdown_template`,
  );
  const updateHash = db.prepare(
    `UPDATE wf_artifact_schemas SET structural_hash = ?
       WHERE id = ? AND version = ?`,
  );
  const del = db.prepare(
    `DELETE FROM wf_artifact_schemas WHERE id = ? AND version = ?`,
  );

  // Plugin contributions live in memory and are replaced wholesale on
  // setPluginContributions — same shape as the loader uses.
  let pluginRecords: ReadonlyArray<ArtifactKindDescriptor> = [];

  /**
   * Memo of descriptors synthesised on demand for parametric kinds
   * (`List<T>`; later `OneOf<…>`, `Success<T>`, `Error<E>`). Cleared
   * wholesale whenever a user record or plugin contribution mutates,
   * since a synthesised entry may transitively depend on any inner
   * descriptor. The rebuild is lazy and cheap (re-resolves through the
   * registry on the next lookup).
   */
  const synthesizedCache = new Map<ArtifactKind, ArtifactKindDescriptor>();

  /**
   * Resolves a parent kind's structural hash through the full registry. Used
   * when building a descriptor whose `extends` chain may cross sources
   * (a user record refining a built-in, or a plugin record refining another
   * plugin record). Falls through to `null` for unknown parents — see
   * {@link HashResolver}.
   */
  const resolveParentHash: HashResolver = (kind) =>
    resolve(kind)?.structuralHash ?? null;

  const loadUserRecords = (): ReadonlyArray<ArtifactKindDescriptor> =>
    (selectAll.all(bindChannel(channels)) as Row[]).map((row) =>
      rowToRecord(row, resolveParentHash),
    );

  const findUserRow = db.prepare(
    `SELECT 1 FROM wf_artifact_schemas WHERE id = ? AND version = ? LIMIT 1`,
  );

  const findPluginRecord = (
    pluginId: string,
    ref: ArtifactSchemaRef,
  ): ArtifactKindDescriptor | null =>
    pluginRecords.find(
      (r) =>
        r.source.kind === "plugin" &&
        r.source.pluginId === pluginId &&
        r.id === ref.id &&
        r.version === ref.version,
    ) ?? null;

  const findUserRecord = (
    ref: ArtifactSchemaRef,
  ): ArtifactKindDescriptor | null => {
    const rows = selectAllUnscoped.all() as Row[];
    const row = rows.find((r) => r.id === ref.id && r.version === ref.version);
    return row ? rowToRecord(row, resolveParentHash) : null;
  };

  /**
   * Resolves a `record:<hash-prefix>` reference by scanning every known
   * descriptor (built-ins + plugins + user rows). Returns `null` for no
   * match; throws on an ambiguous prefix because silent disambiguation
   * could ship the wrong type into a workflow — the caller is expected to
   * make the prefix unique (longer hex).
   */
  const lookupByHashPrefix = (
    hashPrefix: string,
  ): ArtifactKindDescriptor | null => {
    const matches: ArtifactKindDescriptor[] = [];
    for (const d of BUILTIN_DESCRIPTORS_BY_KIND.values()) {
      if (d.structuralHash.startsWith(hashPrefix)) matches.push(d);
    }
    for (const d of pluginRecords) {
      if (d.structuralHash.startsWith(hashPrefix)) matches.push(d);
    }
    for (const row of selectAllUnscoped.all() as Row[]) {
      // Use the row's stored hash when available; otherwise recompute via
      // rowToRecord so post-migration NULLs still match.
      const desc = rowToRecord(row, resolveParentHash);
      if (desc.structuralHash.startsWith(hashPrefix)) matches.push(desc);
    }
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      throw new Error(
        `ambiguous record:<hash> prefix "${hashPrefix}" — ${matches.length} matches`,
      );
    }
    return matches[0];
  };

  /**
   * Synthesises a descriptor for a parametric `List<T>` kind. Returns `null`
   * for non-container kinds; throws {@link UnknownArtifactKindError} when the
   * encoding is malformed or the inner kind does not resolve — the caller
   * cannot recover and the error names the failing inner kind, which is the
   * actionable signal.
   */
  const trySynthesizeListDescriptor = (
    kind: ArtifactKind,
  ): ArtifactKindDescriptor | null => {
    if (!isContainerArtifactKind(kind)) return null;
    const innerKind = parseListArtifactKind(kind);
    if (!innerKind) throw new UnknownArtifactKindError(kind);
    const innerDescriptor = resolve(innerKind);
    if (!innerDescriptor) throw new UnknownArtifactKindError(innerKind);

    const listSchema = z.object({
      items: z.array(innerDescriptor.schema),
    });
    return {
      kind,
      // For synthesised descriptors `id`/`version` are not user-facing keys —
      // the kind string is the identity. Filling them keeps the descriptor
      // shape uniform with stored records.
      id: kind,
      version: "v1",
      name: `List<${innerDescriptor.name}>`,
      description: `List of ${innerDescriptor.name}.`,
      // Inherits its origin from the element type: a `List<Markdown>` is a
      // built-in synthetic, a `List<user:foo@v1>` is a user-derived one.
      source: innerDescriptor.source,
      schema: listSchema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(listSchema, { unrepresentable: "any" }),
      sampleRaw: null,
      // Wrap the inner sample in the `{items: [...]}` envelope when present;
      // `null` if the inner descriptor itself has no sample (let the renderer
      // derive one).
      sample:
        innerDescriptor.sample !== null
          ? { items: [innerDescriptor.sample] }
          : null,
      synthesized: true,
      // Lists are not refinements; covariance flows through the element type
      // (handled directly by `portAccepts`), not through `extends`.
      extends: null,
      // Compositional hash: derived from the inner descriptor's hash rather
      // than from the synthesised `simplifiedSchema`. Two `List<X>` and
      // `List<Y>` collapse iff `X` and `Y` collapse — symmetric with the
      // covariance rule in `portAccepts`.
      structuralHash: composeListStructuralHash(innerDescriptor.structuralHash),
      // Synthesised kinds carry no explicit projection; `render.markdown`
      // falls back to the generic chain (each element's `body` / JSON).
      markdownProjection: null,
    };
  };

  /**
   * Synthesises a descriptor for `OneOf<A,B,…>`. Each variant is resolved
   * recursively via the registry; the payload is the discriminated union
   * `{variantKind, payload}` where the discriminator carries the inner
   * kind string verbatim (lisible in the journal, no separate mapping).
   */
  const trySynthesizeSumDescriptor = (
    kind: ArtifactKind,
  ): ArtifactKindDescriptor | null => {
    if (!isSumArtifactKind(kind)) return null;
    const variants = parseSumArtifactKind(kind);
    if (!variants) throw new UnknownArtifactKindError(kind);
    const variantDescriptors = variants.map((v) => {
      const d = resolve(v);
      if (!d) throw new UnknownArtifactKindError(v);
      return d;
    });
    const sumSchema = z.discriminatedUnion(
      "variantKind",
      variantDescriptors.map((d) =>
        z.object({ variantKind: z.literal(d.kind), payload: d.schema }),
      ) as never,
    );
    return {
      kind,
      id: kind,
      version: "v1",
      name: `OneOf<${variantDescriptors.map((d) => d.name).join(", ")}>`,
      description: `Sum of ${variantDescriptors.length} variants.`,
      // Sum types are part of the algebra core, not bound to a specific source.
      source: { kind: "builtin" },
      schema: sumSchema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(sumSchema, { unrepresentable: "any" }),
      sampleRaw: null,
      // Pick the first variant whose own sample is non-null so the preview
      // shows a concrete discriminated payload; fall back to `null` so the
      // renderer derives one.
      sample: (() => {
        const variant = variantDescriptors.find((d) => d.sample !== null);
        return variant
          ? { variantKind: variant.kind, payload: variant.sample }
          : null;
      })(),
      synthesized: true,
      extends: null,
      structuralHash: composeSumStructuralHash(
        variantDescriptors.map((d) => d.structuralHash),
      ),
      markdownProjection: null,
    };
  };

  /**
   * Synthesises a descriptor for `Success<T>` (sugar for `{variant: "Success",
   * value: T}`). The literal discriminator `"Success"` is what lets a
   * downstream `branch.match` distinguish it from `Error<E>` even when both
   * wrap the same `T`.
   */
  const trySynthesizeSuccessDescriptor = (
    kind: ArtifactKind,
  ): ArtifactKindDescriptor | null => {
    if (!isSuccessArtifactKind(kind)) return null;
    const innerKind = parseSuccessArtifactKind(kind);
    if (!innerKind) throw new UnknownArtifactKindError(kind);
    const innerDescriptor = resolve(innerKind);
    if (!innerDescriptor) throw new UnknownArtifactKindError(innerKind);
    const schema = z.object({
      variant: z.literal("Success"),
      value: innerDescriptor.schema,
    });
    return {
      kind,
      id: kind,
      version: "v1",
      name: `Success<${innerDescriptor.name}>`,
      description: `Successful result wrapping ${innerDescriptor.name}.`,
      source: innerDescriptor.source,
      schema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
      sampleRaw: null,
      sample:
        innerDescriptor.sample !== null
          ? { variant: "Success", value: innerDescriptor.sample }
          : null,
      synthesized: true,
      extends: null,
      structuralHash: composeWrapperStructuralHash(
        "Success",
        innerDescriptor.structuralHash,
      ),
      markdownProjection: null,
    };
  };

  /** Mirror of {@link trySynthesizeSuccessDescriptor} for `Error<E>`. */
  const trySynthesizeErrorDescriptor = (
    kind: ArtifactKind,
  ): ArtifactKindDescriptor | null => {
    if (!isErrorArtifactKind(kind)) return null;
    const innerKind = parseErrorArtifactKind(kind);
    if (!innerKind) throw new UnknownArtifactKindError(kind);
    const innerDescriptor = resolve(innerKind);
    if (!innerDescriptor) throw new UnknownArtifactKindError(innerKind);
    const schema = z.object({
      variant: z.literal("Error"),
      value: innerDescriptor.schema,
    });
    return {
      kind,
      id: kind,
      version: "v1",
      name: `Error<${innerDescriptor.name}>`,
      description: `Failed result wrapping ${innerDescriptor.name}.`,
      source: innerDescriptor.source,
      schema,
      rawSchema: null,
      simplifiedSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
      sampleRaw: null,
      sample:
        innerDescriptor.sample !== null
          ? { variant: "Error", value: innerDescriptor.sample }
          : null,
      synthesized: true,
      extends: null,
      structuralHash: composeWrapperStructuralHash(
        "Error",
        innerDescriptor.structuralHash,
      ),
      markdownProjection: null,
    };
  };

  const trySynthesizeDescriptor = (
    kind: ArtifactKind,
  ): ArtifactKindDescriptor | null =>
    trySynthesizeListDescriptor(kind) ??
    trySynthesizeSumDescriptor(kind) ??
    trySynthesizeSuccessDescriptor(kind) ??
    trySynthesizeErrorDescriptor(kind);

  const isParametricKind = (kind: ArtifactKind): boolean =>
    isContainerArtifactKind(kind) ||
    isSumArtifactKind(kind) ||
    isSuccessArtifactKind(kind) ||
    isErrorArtifactKind(kind);

  const resolve = (kind: ArtifactKind): ArtifactSchemaRecord | null => {
    // Hot path: built-ins seeded once at module load.
    const builtin = BUILTIN_DESCRIPTORS_BY_KIND.get(kind);
    if (builtin) return builtin;

    // Content-addressed lookup: a `record:<hash-prefix>` reference is
    // resolved by structural-hash equality. Coexists with `user:`/`plugin:`
    // aliases — they all collapse to the same descriptor when their hashes
    // match.
    if (isContentAddressedArtifactKind(kind)) {
      const hashPrefix = parseContentAddressedArtifactKind(kind);
      if (!hashPrefix) return null;
      return lookupByHashPrefix(hashPrefix);
    }

    // Synthesised parametric kinds — cached across resolves until a
    // dependency mutates.
    const cached = synthesizedCache.get(kind);
    if (cached) return cached;
    if (isParametricKind(kind)) {
      const synthesized = trySynthesizeDescriptor(kind);
      if (synthesized) {
        synthesizedCache.set(kind, synthesized);
        return synthesized;
      }
      return null;
    }

    const ref = parseDynamicArtifactKind(kind);
    if (!ref) return null;
    if (ref.source === "user") {
      return findUserRecord({ id: ref.id, version: ref.version });
    }
    return findPluginRecord(ref.pluginId, {
      id: ref.id,
      version: ref.version,
    });
  };

  /**
   * One-shot backfill for the v24 migration: rows created before
   * structural-hash existed land with `structural_hash IS NULL`. We compute
   * their hash via `rowToRecord` (which folds in the parent's hash through
   * the registry) and persist the result. Idempotent — subsequent reads
   * hit the populated column.
   */
  const backfillUserHashes = (): void => {
    const rows = selectAllUnscoped.all() as Row[];
    for (const row of rows) {
      if (row.structural_hash != null) continue;
      const desc = rowToRecord(row, resolveParentHash);
      updateHash.run(desc.structuralHash, row.id, row.version);
    }
  };

  backfillUserHashes();

  const getSchema = (kind: ArtifactKind): z.ZodTypeAny | null =>
    resolve(kind)?.schema ?? null;

  const registry: ArtifactSchemaRegistry = {
    list(): ReadonlyArray<ArtifactSchemaRecord> {
      return [
        ...BUILTIN_DESCRIPTORS_BY_KIND.values(),
        ...pluginRecords,
        ...loadUserRecords(),
      ];
    },

    resolve,

    getSchema,

    validate(kind, rawContent) {
      // Cheap pre-check: a resolvable descriptor is required.
      const descriptor = resolve(kind);
      if (!descriptor) {
        return { ok: false, error: new UnknownArtifactKindError(kind) };
      }
      // Two write paths feed the store:
      //  - `putArtifactPayload` writes JSON (the common modern case).
      //  - `start-instance` writes raw seed text (e.g. Markdown body).
      // We mirror the read-side dispatch in `loadAndParseArtifact`: try JSON
      // first, fall back to `plainFallback` so envelope-style kinds still
      // accept their raw body. JSON-decoded payloads validate strictly.
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        try {
          parsed = plainFallback(kind, rawContent);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            error: new ArtifactSchemaError(kind, [
              {
                code: "custom",
                path: [],
                message: `unable to decode raw content: ${message}`,
              } as never,
            ]),
          };
        }
      }
      try {
        parseArtifact(registry, kind, parsed);
        return { ok: true };
      } catch (err) {
        if (
          err instanceof ArtifactSchemaError ||
          err instanceof UnknownArtifactKindError
        ) {
          return { ok: false, error: err };
        }
        throw err;
      }
    },

    async save(type: SaveUserArtifactSchema): Promise<void> {
      // Plugin/builtin records cannot be edited through the registry — they
      // come from the manifest/code. We catch the obvious case where the id
      // collides with a builtin kind name; plugin collisions are scoped by
      // pluginId in the kind encoding so they can't collide via this path.
      if (isBuiltinArtifactKind(type.id)) {
        throw new Error(
          `cannot save artifact type "${type.id}": collides with a built-in kind`,
        );
      }
      const extendsKind: ArtifactKind | null = type.extends ?? null;
      // Compute the hash *before* the upsert so the column is populated on
      // insert — no second-pass UPDATE, and `record:<hash>` lookups resolve
      // the row immediately. The parent hash is resolved through the live
      // registry so a refinement reflects its parent's current shape.
      const structuralHash = computeStructuralHash(
        { simplifiedSchema: type.simplifiedSchema, extends: extendsKind },
        resolveParentHash,
      );
      upsert.run({
        id: type.id,
        version: type.version,
        name: type.name,
        description: type.description ?? "",
        raw_schema_json:
          type.rawSchema == null ? null : JSON.stringify(type.rawSchema),
        simplified_schema_json: JSON.stringify(type.simplifiedSchema),
        sample_raw: type.sampleRaw ?? null,
        sample_json:
          type.sample == null ? null : JSON.stringify(type.sample),
        extends_kind: type.extends ?? null,
        structural_hash: structuralHash,
        markdown_template: type.markdownTemplate ?? null,
        channel_id: channels.getActive(),
        now: new Date().toISOString(),
      });
      // A synthesised entry might transitively depend on the saved kind
      // (e.g. `List<user:foo@v1>` if `user:foo@v1` was just updated).
      // Children that refine this kind keep their stored hash — they go
      // stale until re-saved (cf. spec §5 "Risques", follow-up: eager
      // dependent recompute).
      synthesizedCache.clear();
    },

    async remove(ref: ArtifactSchemaRef): Promise<void> {
      const exists = findUserRow.get(ref.id, ref.version);
      if (!exists) return; // no-op for unknown — matches SkillRegistry semantics
      del.run(ref.id, ref.version);
      synthesizedCache.clear();
    },

    setPluginContributions(
      contributions: ReadonlyArray<PluginArtifactSchemaContribution>,
    ): void {
      pluginRecords = contributions.flatMap(({ pluginId, types }) =>
        types.map((t) =>
          pluginContribToRecord(pluginId, t, resolveParentHash),
        ),
      );
      synthesizedCache.clear();
    },
  };

  return registry;
};

/** Convenience exporters re-used by callers building `ArtifactKind` strings. */
export { toPluginArtifactKind, toUserArtifactKind };
