/**
 * Branded identifier types for the workflow domain.
 *
 * At runtime these are plain `string`s; the `Brand<T, B>` phantom type prevents
 * accidental mixing at compile time (a `StepId` cannot be passed where a
 * `WorkflowId` is expected, even though both are strings).
 */

/** Phantom-typed nominal brand. `T` is the underlying value, `B` the tag. */
export type Brand<T, B> = T & { readonly __brand: B };

/** Identifier of a {@link WorkflowTemplate} (e.g. `"feature-from-spec"`). */
export type TemplateId = Brand<string, "TemplateId">;
/** Version string of a template (e.g. `"v1"`). */
export type TemplateVersion = Brand<string, "TemplateVersion">;
/** Identifier of a {@link StepDef} within a template (e.g. `"generate-patch"`). */
export type StepId = Brand<string, "StepId">;
/** Identifier of a single {@link StepExecution} of a step within an instance. */
export type StepExecId = Brand<string, "StepExecId">;
/** Identifier of a {@link WorkflowInstance}. */
export type WorkflowId = Brand<string, "WorkflowId">;
/** Identifier of an {@link Artifact}. */
export type ArtifactId = Brand<string, "ArtifactId">;
/** SHA-256 hex digest of an artifact's content — used for deduplication. */
export type ArtifactHash = Brand<string, "ArtifactHash">;
/** Reference to a Skill by name (e.g. `"implement-from-spec"`). */
export type SkillRef = Brand<string, "SkillRef">;
/** Identifier of a {@link DomainEvent} — used to deduplicate on replay. */
export type EventId = Brand<string, "EventId">;
/** Identifier of a {@link Run} (one LLM invocation trace). */
export type RunId = Brand<string, "RunId">;
/** Identifier of a {@link FeedbackLoop}. */
export type LoopId = Brand<string, "LoopId">;

/**
 * Generic brand helper. Given a brand name `B`, returns a function that tags
 * any value as `Brand<T, B>`. Used to build the `as*` helpers below.
 */
export const brand = <B extends string>() => <T>(v: T): Brand<T, B> => v as Brand<T, B>;

/** Tag a raw string as a {@link TemplateId}. */
export const asTemplateId = brand<"TemplateId">();
/** Tag a raw string as a {@link TemplateVersion}. */
export const asTemplateVersion = brand<"TemplateVersion">();
/** Tag a raw string as a {@link StepId}. */
export const asStepId = brand<"StepId">();
/** Tag a raw string as a {@link StepExecId}. */
export const asStepExecId = brand<"StepExecId">();
/** Tag a raw string as a {@link WorkflowId}. */
export const asWorkflowId = brand<"WorkflowId">();
/** Tag a raw string as an {@link ArtifactId}. */
export const asArtifactId = brand<"ArtifactId">();
/** Tag a raw string as an {@link ArtifactHash}. */
export const asArtifactHash = brand<"ArtifactHash">();
/** Tag a raw string as a {@link SkillRef}. */
export const asSkillRef = brand<"SkillRef">();
/** Tag a raw string as an {@link EventId}. */
export const asEventId = brand<"EventId">();
/** Tag a raw string as a {@link RunId}. */
export const asRunId = brand<"RunId">();
/** Tag a raw string as a {@link LoopId}. */
export const asLoopId = brand<"LoopId">();

/**
 * Separator between a template's id and version in a ref string
 * (`"<id>@<version>"`). A raw `@` inside an id or version breaks this encoding:
 * an id of `"transcriptor@v1"` with version `"v1"` yields the ref
 * `"transcriptor@v1@v1"`, which {@link parseTemplateRef} can no longer split
 * back into the original pair — the template becomes un-openable and
 * un-deletable through the normal ref-based paths.
 */
export const TEMPLATE_REF_SEPARATOR = "@";

/**
 * Parse a `"<id>@<version>"` template ref into its branded parts.
 *
 * Stricter than a bare `ref.split("@")`: it requires *exactly* one separator,
 * with a non-empty id and version on either side. A ref carrying extra `@`
 * segments (`"id@v1@v1"`) is rejected outright instead of being silently
 * truncated to the wrong `(id, version)` pair — the failure mode that made a
 * malformed template both un-openable and un-deletable.
 *
 * @throws {Error} if `ref` is not a single `id@version` pair.
 */
export const parseTemplateRef = (
  ref: string,
): { id: TemplateId; version: TemplateVersion } => {
  const parts = ref.split(TEMPLATE_REF_SEPARATOR);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid template ref: ${ref}`);
  }
  return { id: asTemplateId(parts[0]), version: asTemplateVersion(parts[1]) };
};
