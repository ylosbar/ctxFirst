/**
 * Port for persisting the bodies of {@link Artifact}s (specs, code patches…).
 * The domain only manipulates metadata; content goes through this port.
 *
 * Implementation: {@link createFsArtifactStore} (filesystem under
 * `userData/artifacts/<sha256>.bin`).
 */
import type { Artifact, ArtifactKind } from "../../../domain/artifact";
import type { ArtifactId } from "../../../domain/ids";

/** Result of a load: the metadata plus the decoded content. */
export type ArtifactContent = { meta: Artifact; content: string };

/**
 * Per-call knobs on {@link ArtifactStore.put}. Kept internal to the
 * application — never serialised over IPC.
 */
export type PutArtifactOptions = {
  /**
   * Skip the in-store schema validation that normally runs before any I/O.
   *
   * Sole legitimate caller is the LLM schema-repair loop, which validates
   * the payload itself (to drive retries) and then persists the already-
   * validated content — a second pass would be wasted work. Any other
   * caller paying the zod cost twice is harmless; opting in is what's
   * surprising.
   */
  skipValidation?: boolean;
};

export interface ArtifactStore {
  /**
   * Stores `content` under its SHA-256. Duplicate content returns the
   * existing record — hash-addressed so it is naturally deduplicated.
   *
   * Validates `content` against the schema bound to `kind` before any I/O.
   * A non-conformant payload throws `ArtifactSchemaError` (kind known but
   * shape wrong) or `UnknownArtifactKindError` (kind unresolvable) and
   * leaves the store untouched.
   */
  put(
    kind: ArtifactKind,
    content: string,
    metadata?: Record<string, string>,
    options?: PutArtifactOptions,
  ): Promise<Artifact>;
  /** Loads metadata + content by {@link ArtifactId}. Throws if unknown. */
  get(id: ArtifactId): Promise<ArtifactContent>;
  /** Lookup by content hash. Returns `null` if not found. */
  getByHash(hash: string): Promise<ArtifactContent | null>;
}
