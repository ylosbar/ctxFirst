/**
 * Back-compat re-export shim. The artifact subsystem now exposes:
 *  - {@link parseArtifact} and {@link ArtifactPayload} from `./parse-artifact`
 *  - {@link UnknownArtifactKindError}, {@link ArtifactSchemaError},
 *    {@link ArtifactKindMismatchError} from `./artifact-errors`
 *  - The built-in payload schemas from `./BuiltIns`
 *    (`BUILTIN_SCHEMAS`) and full descriptors (`BUILTIN_DESCRIPTORS`).
 *
 * This file is kept so the plugin runners (and a handful of legacy adapters)
 * can still import `ArtifactPayload` from the old path during the transition.
 * The static built-in payload table and the singleton dynamic-schema resolver
 * are gone — every kind now goes through `ArtifactSchemaRegistry`.
 */
export {
  parseArtifact,
  type ArtifactPayload,
  type ArtifactSchemaResolver,
} from "./parse-artifact";
export {
  ArtifactKindMismatchError,
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "./artifact-errors";
