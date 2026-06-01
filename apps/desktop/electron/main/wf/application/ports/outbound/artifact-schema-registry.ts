/**
 * Port for resolving **dynamic** artifact kinds — user-defined types (UI,
 * persisted in `wf_artifact_schemas`) and plugin-contributed types (manifest).
 * The adapter merges three sources at boot: built-ins (synthesised from
 * `ArtifactSchemas`), plugin contributions (push-registered by the loader),
 * and DB rows. Cf. PLUGINS.md §6.5.
 *
 * `parseArtifact` in the domain layer dispatches via this port's
 * `getSchema(kind)` for any kind that isn't a built-in.
 */
import type { z } from "zod";
import type { ArtifactKind } from "../../../domain/artifact";
import type {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../../../domain/artifact-schemas";
import type {
  ArtifactSchemaRecord,
  ArtifactSchemaRef,
  SaveUserArtifactSchema,
} from "../../../domain/artifact-schema";

/**
 * Snapshot view of one plugin's artifact-schema contributions, passed at
 * registry construction time. The loader builds this from the manifest's
 * `contributions.artifactSchemas` (paths already resolved to JSON values).
 */
export type PluginArtifactSchemaContribution = {
  pluginId: string;
  types: ReadonlyArray<{
    id: string;
    version: string;
    name: string;
    description?: string;
    rawSchema?: unknown | null;
    simplifiedSchema: unknown;
    sampleRaw?: string | null;
    /**
     * Optional sample of the simplified payload, surfaced read-only by the
     * `KindPreview` UI. Omitting lets the renderer auto-derive a best-effort
     * sample from `simplifiedSchema`.
     */
    sample?: unknown | null;
    /** Super-type for refinement (§2). `null`/omitted ⇒ no parent. */
    extends?: string | null;
    /**
     * Optional `{{field}}` Markdown gabarit, mapped to a `{ kind: "template" }`
     * projection. Lets a plugin without rendering code declare a projection in
     * its `manifest.json` (cf. `specs/typed-kind-rendered-markdown.md` §5).
     */
    markdownTemplate?: string;
  }>;
};

export interface ArtifactSchemaRegistry {
  /** Every record visible to the engine: builtin + plugin + user. */
  list(): ReadonlyArray<ArtifactSchemaRecord>;
  /** Resolves a fully-encoded {@link ArtifactKind}; returns `null` if unknown. */
  resolve(kind: ArtifactKind): ArtifactSchemaRecord | null;
  /**
   * Compiled zod schema for the kind's **simplified** payload, with cache.
   * Returns `null` when the kind is unknown — `parseArtifact` will surface a
   * structured error from there.
   */
  getSchema(kind: ArtifactKind): z.ZodTypeAny | null;
  /**
   * Validates the raw stored content of an artifact against its kind's schema.
   * Used by the {@link ArtifactStore} to reject malformed payloads at `put`
   * time before any I/O. Returns a structured result rather than throwing so
   * the store can decide on the call-site (rollback path, surfaced error).
   *
   * Strategy mirrors the read path (`loadAndParseArtifact`): try `JSON.parse`
   * first (the common case — anything written by `putArtifactPayload`), then
   * fall back to `plainFallback` semantics for raw text seeds (Markdown body,
   * etc.). Then runs `parseArtifact` against the resolved schema.
   *
   *  - Unknown kinds: `{ ok: false, error: UnknownArtifactKindError }`.
   *  - Otherwise: `{ ok: true }` or `{ ok: false, error: ArtifactSchemaError }`.
   */
  validate(
    kind: ArtifactKind,
    rawContent: string,
  ):
    | { ok: true }
    | { ok: false; error: ArtifactSchemaError | UnknownArtifactKindError };
  /** Upsert a user-defined type. Rejects when targeting a builtin/plugin. */
  save(type: SaveUserArtifactSchema): Promise<void>;
  /** Deletes a user-defined type. No-op if unknown; rejects non-user kinds. */
  remove(ref: ArtifactSchemaRef): Promise<void>;
  /**
   * Replaces the current set of plugin contributions. Called once at boot by
   * the composition root after the plugin loader has scanned the disk, and
   * again whenever a plugin is enabled/disabled at runtime (Phase 3).
   */
  setPluginContributions(
    contributions: ReadonlyArray<PluginArtifactSchemaContribution>,
  ): void;
}
