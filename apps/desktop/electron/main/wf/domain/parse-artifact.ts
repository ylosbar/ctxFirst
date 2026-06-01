/**
 * Schema-driven payload validation, routed exclusively through the
 * {@link ArtifactSchemaRegistry}. No singleton resolver, no built-in
 * dispatch branch — the registry is the single source of truth for every
 * kind (built-in, user, plugin, and later parametric).
 */
import type { z } from "zod";
import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "./artifact-errors";
import type { ArtifactKind, BuiltinArtifactKind } from "./artifact";
import type { BUILTIN_SCHEMAS } from "./BuiltIns";

/**
 * Minimal registry surface needed for validation. The full
 * `ArtifactSchemaRegistry` port satisfies this contract; tests can build a
 * tiny stub instead of stubbing the whole port.
 */
export type ArtifactSchemaResolver = {
  getSchema(kind: ArtifactKind): z.ZodTypeAny | null;
};

/**
 * Static payload type for a kind. For built-ins we infer from the Zod schema
 * declared in `BuiltIns`; dynamic (`user:` / `plugin:`) kinds only
 * know their shape at runtime via the registry, so the payload degrades to
 * `unknown`.
 */
export type ArtifactPayload<K extends ArtifactKind> =
  K extends BuiltinArtifactKind
    ? z.infer<(typeof BUILTIN_SCHEMAS)[K]>
    : unknown;

/**
 * Validates `raw` against the Zod schema bound to `kind`. Throws
 * {@link UnknownArtifactKindError} if the registry has no descriptor for
 * the kind, {@link ArtifactSchemaError} if the payload fails validation.
 *
 * Callers receive the *typed* payload (`z.infer`) for built-in kinds and
 * `unknown` for dynamic kinds — same erasure rules as before.
 */
export const parseArtifact = <K extends ArtifactKind>(
  resolver: ArtifactSchemaResolver,
  kind: K,
  raw: unknown,
): ArtifactPayload<K> => {
  const schema = resolver.getSchema(kind);
  if (!schema) {
    throw new UnknownArtifactKindError(kind);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ArtifactSchemaError(kind, result.error.issues);
  }
  return result.data as ArtifactPayload<K>;
};
