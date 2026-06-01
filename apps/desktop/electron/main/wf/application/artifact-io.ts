/**
 * Shared helpers around {@link ArtifactStore} that bridge the **wire format**
 * (JSON string with `metadata.payloadFormat = "json-v1"`) and the **typed
 * payload** of the descriptor returned by `ArtifactSchemaRegistry.resolve(kind)`.
 *
 * Every new runner writes through {@link putArtifactPayload}; the orchestrator
 * reads back through {@link loadAndParseArtifact}.
 */
import type { ArtifactKind, Artifact } from "../domain/artifact";
import {
  ArtifactKindMismatchError,
  ArtifactSchemaError,
} from "../domain/artifact-errors";
import {
  parseArtifact,
  type ArtifactPayload,
} from "../domain/parse-artifact";
import { plainFallback } from "../domain/artifact-serializer";
import type { ArtifactId } from "../domain/ids";
import type { ArtifactSchemaRegistry } from "./ports/outbound/artifact-schema-registry";
import type { ArtifactStore } from "./ports/outbound/artifact-store";
import type { LoggerPort } from "./ports/outbound/logger";

export type ValidationMode = "strict" | "log-only" | "off";

/** Marker stored in `metadata` to distinguish JSON-v1 from pre-migration content. */
export const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

/**
 * Coerces an arbitrary string (e.g. read from configuration or env at the
 * composition root) into a {@link ValidationMode}. Default is `strict`
 * (phase B); `log-only` is the phase-A default; `off` is the rollback.
 */
export const parseValidationMode = (raw?: string): ValidationMode => {
  if (raw === "off") return "off";
  if (raw === "log-only") return "log-only";
  return "strict";
};

/**
 * Writes a typed payload to the store as JSON, tagging the artifact with
 * `payloadFormat: "json-v1"` so future loaders know how to parse it.
 *
 * Validation of the payload against the descriptor's schema is performed
 * inside `ArtifactStore.put` (via the registry's `validate`), so this helper
 * no longer pre-validates — the runner-side type-check at the call site
 * already catches the obvious shape mistakes for built-ins, and the store
 * catches the rest.
 */
export const putArtifactPayload = async <K extends ArtifactKind>(
  store: ArtifactStore,
  kind: K,
  payload: ArtifactPayload<K>,
  metadata: Record<string, string> = {},
): Promise<Artifact> => {
  const json = JSON.stringify(payload);
  return store.put(kind, json, {
    ...metadata,
    payloadFormat: PAYLOAD_FORMAT_JSON_V1,
  });
};

export type LoadedArtifact<K extends ArtifactKind> = {
  meta: Artifact;
  content: string;
  payload: ArtifactPayload<K> | null;
};

/**
 * Loads an artifact and parses its payload according to `expectedKind` and
 * the active `mode`. Returns `{ content, payload }` so runners that still
 * need raw text (prompts, debug) keep access.
 *
 *  - `strict`: parse failures throw `ArtifactSchemaError`.
 *  - `log-only`: parse failures are swallowed, `payload` is `null`.
 *  - `off`: validation is fully skipped; `payload` is `null`.
 *
 * `ArtifactKindMismatchError` is *always* thrown — it indicates a programming
 * bug (the caller asked for the wrong kind), not a migration concern.
 */
export const loadAndParseArtifact = async <K extends ArtifactKind>(
  store: ArtifactStore,
  registry: ArtifactSchemaRegistry,
  id: ArtifactId,
  expectedKind: K,
  mode: ValidationMode,
  logger: LoggerPort,
): Promise<LoadedArtifact<K>> => {
  const { meta, content } = await store.get(id);
  if (meta.kind !== expectedKind) {
    throw new ArtifactKindMismatchError(meta.kind, expectedKind);
  }
  if (mode === "off") return { meta, content, payload: null };

  const fmt = meta.metadata.payloadFormat ?? "plain";
  let raw: unknown;
  try {
    raw =
      fmt === PAYLOAD_FORMAT_JSON_V1
        ? JSON.parse(content)
        : plainFallback(expectedKind, content);
  } catch (err) {
    if (mode === "strict") throw err;
    logger.warn(
      `[wf:artifact] invalid_input id=${id.slice(0, 8)} kind=${expectedKind} reason=raw-decode: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { meta, content, payload: null };
  }

  try {
    const payload = parseArtifact(registry, expectedKind, raw);
    return { meta, content, payload };
  } catch (err) {
    if (mode === "strict") throw err;
    if (err instanceof ArtifactSchemaError) {
      logger.warn(
        `[wf:artifact] invalid_input id=${id.slice(0, 8)} kind=${expectedKind} issues=${err.issues.length}`,
      );
    }
    return { meta, content, payload: null };
  }
};
