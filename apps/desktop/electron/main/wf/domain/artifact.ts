/**
 * Artifacts are the typed payloads that flow between steps of a workflow.
 * The domain only manipulates their metadata; the actual content is stored
 * out-of-band via the {@link ArtifactStore} port.
 */
import {
  isContainerArtifactKind as isContainerArtifactKindString,
  isContentAddressedArtifactKind as isContentAddressedArtifactKindString,
  isErrorArtifactKind as isErrorArtifactKindString,
  isSuccessArtifactKind as isSuccessArtifactKindString,
  isSumArtifactKind as isSumArtifactKindString,
  parseContentAddressedArtifactKind as parseContentAddressedArtifactKindString,
  parseErrorArtifactKind as parseErrorArtifactKindString,
  parseListArtifactKind as parseListArtifactKindString,
  parseSuccessArtifactKind as parseSuccessArtifactKindString,
  parseSumArtifactKind as parseSumArtifactKindString,
  MAX_KIND_DEPTH,
  MAX_SUM_VARIANTS,
} from "../../../../shared/wf/artifact-kind-grammar";
import type { ArtifactHash, ArtifactId } from "./ids";

export { MAX_KIND_DEPTH, MAX_SUM_VARIANTS };

/**
 * Closed set of artifact kinds shipped in the binary. Their descriptors
 * (including compiled Zod schemas) live in the `BuiltIns/` folder. New
 * built-in kinds must be added here AND in `BUILTIN_DESCRIPTORS`.
 *
 * Primitives (`String`, `Number`, `Boolean`) are the root non-envelope scalars
 * — `String` is the parent of every text-shaped refinement (`Url`, `Email`,
 * `DateTime`, `LinearRef`), exposed via the descriptor's `extends` field. The
 * envelope kinds (`Markdown`, `Json`) keep their `{format, body}` shape; they
 * are not collapsed into primitives.
 */
export type BuiltinArtifactKind =
  | "String"
  | "Number"
  | "Boolean"
  | "Url"
  | "Email"
  | "DateTime"
  | "LinearRef"
  | "Markdown"
  | "Path"
  | "PathList"
  | "MarkdownList"
  | "Json"
  | "RunExport";

const BUILTIN_KIND_SET: ReadonlySet<string> = new Set<BuiltinArtifactKind>([
  "String",
  "Number",
  "Boolean",
  "Url",
  "Email",
  "DateTime",
  "LinearRef",
  "Markdown",
  "Path",
  "PathList",
  "MarkdownList",
  "Json",
  "RunExport",
]);

/**
 * User-defined artifact kind declared from the UI and persisted in
 * `wf_artifact_schemas`. Encoded as `user:<id>@<version>` so it round-trips
 * as a plain string through events, IPC and the artifact store.
 */
export type UserArtifactKind = `user:${string}@${string}`;

/**
 * Artifact kind shipped by a plugin via its manifest's `contributions.artifactSchemas`.
 * Encoded as `plugin:<pluginId>:<id>@<version>`.
 */
export type PluginArtifactKind = `plugin:${string}:${string}@${string}`;

/**
 * Parametric list of an inner kind. Encoded `List<T>` where `T` is itself a
 * serialised `ArtifactKind` — nesting is allowed (`List<List<Path>>`). The
 * `<` character does not appear in any other encoding (built-ins, `user:`,
 * `plugin:`) so the grammar is non-ambiguous by construction.
 *
 * Descriptors for `List<T>` are synthesised on demand by the registry; this
 * type is the carrier shape that survives IPC / SQLite / events round-trips.
 */
export type ContainerArtifactKind = `List<${string}>`;

/**
 * Discriminated sum of N variants. Encoded `OneOf<A,B,…>` (no whitespace, at
 * least two variants, at most {@link MAX_SUM_VARIANTS}). Payload shape is
 * `{variantKind, payload}` where `variantKind` is one of the inner kinds and
 * `payload` matches its descriptor. Synthesised by the registry exactly like
 * `List<T>` — variants may themselves be parametric.
 */
export type SumArtifactKind = `OneOf<${string}>`;

/**
 * Sugar for the record `{variant: "Success", value: T}`. Implemented as a
 * dedicated parametric kind so the discriminator (`"Success"`) round-trips
 * through events and matches the spec's `Success<T>` notation. Pairs with
 * {@link ErrorArtifactKind} under a `OneOf<Success<T>,Error<E>>`.
 */
export type SuccessArtifactKind = `Success<${string}>`;

/** Mirror of {@link SuccessArtifactKind} for the `"Error"` variant. */
export type ErrorArtifactKind = `Error<${string}>`;

/**
 * Content-addressed reference to a descriptor by structural hash (§5).
 * Encoded `record:<hex>` where `<hex>` is a (possibly truncated) SHA-256;
 * the registry resolves the prefix to the matching descriptor and rejects
 * ambiguous prefixes. Coexists with `user:` / `plugin:` aliases — they
 * resolve to the same descriptor via independent paths.
 */
export type ContentAddressedArtifactKind = `record:${string}`;

/**
 * Open union — built-in plus runtime contributions (user-defined types in DB
 * and plugin-contributed types in manifests), parametric containers
 * (`List<T>`, `OneOf<…>`, `Success<T>`, `Error<E>`) and content-addressed
 * references (`record:<hash>`). All resolution flows through
 * `ArtifactSchemaRegistry.resolve`; `parseArtifact` no longer dispatches on
 * the kind shape.
 */
export type ArtifactKind =
  | BuiltinArtifactKind
  | ContainerArtifactKind
  | SumArtifactKind
  | SuccessArtifactKind
  | ErrorArtifactKind
  | ContentAddressedArtifactKind
  | UserArtifactKind
  | PluginArtifactKind;

export const isBuiltinArtifactKind = (
  kind: string,
): kind is BuiltinArtifactKind => BUILTIN_KIND_SET.has(kind);

export const isUserArtifactKind = (
  kind: string,
): kind is UserArtifactKind => /^user:[^@]+@.+$/.test(kind);

export const isPluginArtifactKind = (
  kind: string,
): kind is PluginArtifactKind => /^plugin:[^:]+:[^@]+@.+$/.test(kind);

/**
 * Typed wrappers around the {@link
 * ../../../../shared/wf/artifact-kind-grammar} pure-string helpers — the
 * shared module deals in `string`, the engine domain layer narrows back to
 * the {@link ArtifactKind} union.
 */
export const isContainerArtifactKind = (
  kind: string,
): kind is ContainerArtifactKind => isContainerArtifactKindString(kind);

export const parseListArtifactKind = (
  kind: string,
): ArtifactKind | null =>
  parseListArtifactKindString(kind) as ArtifactKind | null;

export const isSumArtifactKind = (
  kind: string,
): kind is SumArtifactKind => isSumArtifactKindString(kind);

export const parseSumArtifactKind = (
  kind: string,
): ArtifactKind[] | null =>
  parseSumArtifactKindString(kind) as ArtifactKind[] | null;

export const isSuccessArtifactKind = (
  kind: string,
): kind is SuccessArtifactKind => isSuccessArtifactKindString(kind);

export const parseSuccessArtifactKind = (
  kind: string,
): ArtifactKind | null =>
  parseSuccessArtifactKindString(kind) as ArtifactKind | null;

export const isErrorArtifactKind = (
  kind: string,
): kind is ErrorArtifactKind => isErrorArtifactKindString(kind);

export const parseErrorArtifactKind = (
  kind: string,
): ArtifactKind | null =>
  parseErrorArtifactKindString(kind) as ArtifactKind | null;

export const isContentAddressedArtifactKind = (
  kind: string,
): kind is ContentAddressedArtifactKind =>
  isContentAddressedArtifactKindString(kind);

/** Returns the hex hash (or prefix) carried by a `record:<hash>` kind. */
export const parseContentAddressedArtifactKind = (
  kind: string,
): string | null => parseContentAddressedArtifactKindString(kind);

/** Parsed coordinates of a dynamic (`user:` or `plugin:`) artifact kind. */
export type DynamicArtifactKindRef =
  | { source: "user"; id: string; version: string }
  | { source: "plugin"; pluginId: string; id: string; version: string };

/**
 * Splits a dynamic artifact kind back into its parts. Returns `null` for
 * built-in kinds or malformed strings. Used by the registries to look up
 * the matching `ArtifactSchemaRecord`.
 */
export const parseDynamicArtifactKind = (
  kind: string,
): DynamicArtifactKindRef | null => {
  const userMatch = /^user:([^@]+)@(.+)$/.exec(kind);
  if (userMatch) return { source: "user", id: userMatch[1], version: userMatch[2] };
  const pluginMatch = /^plugin:([^:]+):([^@]+)@(.+)$/.exec(kind);
  if (pluginMatch)
    return {
      source: "plugin",
      pluginId: pluginMatch[1],
      id: pluginMatch[2],
      version: pluginMatch[3],
    };
  return null;
};

/**
 * Metadata of an artifact. The content is **not** embedded — use
 * {@link ArtifactStore.get} with the `id` to load it.
 *
 * @property hash SHA-256 of the content; identical content produces the same hash,
 *                enabling storage deduplication.
 * @property storageRef Opaque reference used by the store (e.g. filesystem path)
 *                      to locate the content bytes.
 */
export type Artifact = {
  id: ArtifactId;
  kind: ArtifactKind;
  hash: ArtifactHash;
  storageRef: string;
  metadata: Readonly<Record<string, string>>;
  createdAt: string;
};
