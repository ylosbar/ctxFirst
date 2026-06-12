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
  applyDeclarativePatch,
  type CoerceFrom,
  type DeclarativePatch,
} from "../domain/artifact-coercion";
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
  /**
   * Effective kind the payload was parsed against. Equals `meta.kind` on the
   * normal path; for a read-time coercion (§2.4, P3) it is the consumer's
   * target kind — the same-`id` successor version. Runners dispatch on this,
   * so it must be the *coerced* kind, never the writer's stored `meta.kind`.
   */
  kind: ArtifactKind;
};

/**
 * Selects a read-time coercion (§2.4, P3) when the consumer port does not
 * directly accept the writer's kind but declares a same-`id` successor version
 * whose descriptor carries a matching {@link CoerceFrom}.
 *
 * Strict fallback: returns `null` whenever the port already accepts the writer
 * kind (literal or `"*"` wildcard) — those parse against their own schema as
 * before. The match is exact and version-ordering-free: a target only coerces
 * the single predecessor kind reconstructed from its own kind string with the
 * version swapped to `coerceFrom.fromVersion`, so no cross-`id` or non-adjacent
 * jump can ever fire.
 */
export const pickCoercionTarget = (
  resolveDescriptor: (
    kind: ArtifactKind,
  ) => { kind: ArtifactKind; coerceFrom: CoerceFrom | null } | null,
  writerKind: ArtifactKind,
  candidateKinds: ReadonlyArray<ArtifactKind | "*"> | undefined,
): { targetKind: ArtifactKind; patch: DeclarativePatch } | null => {
  if (!candidateKinds || candidateKinds.length === 0) return null;
  if (candidateKinds.includes(writerKind) || candidateKinds.includes("*")) {
    return null;
  }
  for (const candidate of candidateKinds) {
    if (candidate === "*") continue;
    const desc = resolveDescriptor(candidate);
    const cf = desc?.coerceFrom;
    if (!cf) continue;
    const at = desc.kind.lastIndexOf("@");
    if (at < 0) continue; // non-versioned (built-in) target — nothing to bridge
    const declaredWriter = `${desc.kind.slice(0, at)}@${cf.fromVersion}`;
    if (declaredWriter === writerKind) {
      return { targetKind: desc.kind, patch: cf.patch };
    }
  }
  return null;
};

/**
 * Loads an artifact and parses its payload according to `expectedKind` and
 * the active `mode`. Returns `{ content, payload, kind }` so runners that still
 * need raw text (prompts, debug) keep access.
 *
 *  - `strict`: parse failures throw `ArtifactSchemaError`.
 *  - `log-only`: parse failures are swallowed, `payload` is `null`.
 *  - `off`: validation is fully skipped; `payload` is `null`.
 *
 * `ArtifactKindMismatchError` is thrown when `meta.kind !== expectedKind` — a
 * programming bug (the caller asked for the wrong kind) — *unless* a declared
 * coercion bridges the gap.
 *
 * `coerceTargets` (the consumer port's declared kinds) enables P3 read-time
 * coercion: when the writer's kind isn't directly accepted but a target
 * declares a same-`id` `coerceFrom` from it, the declarative patch reshapes the
 * decoded payload before validation. Confined to `json-v1` payloads in `strict`
 * / `log-only`; `off` (the rollback) never coerces.
 */
export const loadAndParseArtifact = async <K extends ArtifactKind>(
  store: ArtifactStore,
  registry: ArtifactSchemaRegistry,
  id: ArtifactId,
  expectedKind: K,
  mode: ValidationMode,
  logger: LoggerPort,
  coerceTargets?: ReadonlyArray<ArtifactKind | "*">,
): Promise<LoadedArtifact<K>> => {
  const { meta, content } = await store.get(id);
  const fmt = meta.metadata.payloadFormat ?? "plain";

  // Resolve the narrow coercion window before the mismatch guard so a declared
  // same-id upgrade tolerates `meta.kind !== expectedKind` (the v_prev artifact
  // confronted with the v_next schema). `off` is the rollback — never coerce.
  const coercion =
    mode !== "off" && fmt === PAYLOAD_FORMAT_JSON_V1
      ? pickCoercionTarget((k) => registry.resolve(k), meta.kind, coerceTargets)
      : null;
  const parseKind = (coercion ? coercion.targetKind : expectedKind) as K;

  if (meta.kind !== expectedKind && !coercion) {
    throw new ArtifactKindMismatchError(meta.kind, expectedKind);
  }
  if (mode === "off") return { meta, content, payload: null, kind: meta.kind };

  let raw: unknown;
  try {
    raw =
      fmt === PAYLOAD_FORMAT_JSON_V1
        ? JSON.parse(content)
        : plainFallback(parseKind, content);
  } catch (err) {
    if (mode === "strict") throw err;
    logger.warn(
      `[wf:artifact] invalid_input id=${id.slice(0, 8)} kind=${parseKind} reason=raw-decode: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { meta, content, payload: null, kind: parseKind };
  }

  // Apply the declarative coercion patch between decode and parse — the single
  // mutation site (§2.4). Stored bytes are never rewritten; only this in-memory
  // view is reshaped to the target version's shape.
  if (coercion) {
    try {
      raw = applyDeclarativePatch(raw, coercion.patch);
    } catch (err) {
      if (mode === "strict") throw err;
      logger.warn(
        `[wf:artifact] coercion_failed id=${id.slice(0, 8)} from=${meta.kind} to=${parseKind}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { meta, content, payload: null, kind: parseKind };
    }
  }

  try {
    const payload = parseArtifact(registry, parseKind, raw);
    return { meta, content, payload, kind: parseKind };
  } catch (err) {
    if (mode === "strict") throw err;
    if (err instanceof ArtifactSchemaError) {
      logger.warn(
        `[wf:artifact] invalid_input id=${id.slice(0, 8)} kind=${parseKind} issues=${err.issues.length}`,
      );
    }
    return { meta, content, payload: null, kind: parseKind };
  }
};
