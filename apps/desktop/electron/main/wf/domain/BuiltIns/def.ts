/**
 * Per-file shape for a built-in artifact type. Each kind in this folder exports
 * one `… satisfies BuiltinTypeDef` const; {@link ./index} folds them into the
 * compiled `BUILTIN_SCHEMAS` map and `BUILTIN_DESCRIPTORS` list.
 *
 * Declare each const with `as const satisfies BuiltinTypeDef` (not a type
 * annotation): the `satisfies` keeps `schema`'s precise Zod type — load-bearing
 * for `z.infer<(typeof BUILTIN_SCHEMAS)[K]>` in `parse-artifact.ts` — while
 * `as const` narrows `kind`/`parent` to literals so the descriptor builder type-
 * checks against `BuiltinArtifactKind`.
 */
import type { z } from "zod";
import type { ArtifactKind, BuiltinArtifactKind } from "../artifact";

export type BuiltinTypeDef = {
  kind: BuiltinArtifactKind;
  name: string;
  description: string;
  /** Super-type for refinements (§2); `null` for primitive roots. */
  parent: ArtifactKind | null;
  schema: z.ZodTypeAny;
  /**
   * Optional pure Markdown projection of this kind's payload, folded into the
   * descriptor as a `{ kind: "fn" }` projection by {@link ../index}. Omit to
   * fall back to the generic chain in `renderArtifactMarkdown`.
   */
  markdown?: (payload: unknown) => string;
};
