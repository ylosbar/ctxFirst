/**
 * Structured errors raised by the artifact subsystem. Extracted into their own
 * module so the application layer (`artifact-io`, the orchestrator, the
 * registry adapters) can import them without pulling in the legacy
 * `artifact-schemas.ts` table.
 */
import type { z } from "zod";
import type { ArtifactKind } from "./artifact";

/** Thrown when a kind is referenced but no descriptor can be resolved for it. */
export class UnknownArtifactKindError extends Error {
  constructor(readonly kind: ArtifactKind) {
    super(
      `Unknown artifact kind "${kind}": the registry could not resolve a ` +
        `descriptor (no built-in, no plugin contribution, no user record).`,
    );
  }
}

/** Zod issue surfaced when an artifact payload fails its schema. */
export class ArtifactSchemaError extends Error {
  constructor(
    readonly kind: ArtifactKind,
    readonly issues: ReadonlyArray<z.ZodIssue>,
  ) {
    super(
      `Artifact of kind ${kind} failed validation: ${issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
}

/** Raised when an artifact's declared kind doesn't match the expected kind. */
export class ArtifactKindMismatchError extends Error {
  constructor(
    readonly actual: ArtifactKind,
    readonly expected: ArtifactKind,
  ) {
    super(`Artifact kind mismatch: expected ${expected}, got ${actual}`);
  }
}
