/**
 * Domain types for **parsers** — transforms that reduce a raw payload to its
 * simplified form before injection into an LLM prompt. Two execution modes:
 *
 *  - `declarative`: an interpreted tree of `pick`/`map`/`filter`/`limit` ops.
 *    Safe (no Turing-completeness), serialisable, LLM-friendly to generate.
 *  - `code`: a JS function executed in a QuickJS sandbox (V2, see PLUGINS.md §7.2).
 *
 * Parsers live alongside types: a parser targets one `(typeId, typeVersion)`;
 * a type may have zero or many parsers; at most one is "active" at a given
 * moment (the one `ContextAssembler` will apply).
 */
import type { ArtifactSchemaRef } from "./artifact-schema";

export type ParserRef = {
  id: string;
  version: string;
};

export type ParserMode = "declarative" | "code";

export type ParserSource =
  | { kind: "plugin"; pluginId: string }
  | { kind: "user" };

/**
 * Fully-resolved parser as known to the engine. `body` shape depends on
 * `mode`:
 *  - `declarative`: an object with `operations: ParserOperation[]` (validated
 *    by the declarative runtime, not here).
 *  - `code`: a string holding the JS source (executed by `quickjs-parser-runtime`).
 *
 * The runtime layer is responsible for interpreting `body`; this domain type
 * is intentionally opaque so the registry can stay simple.
 */
export type ParserRecord = {
  id: string;
  version: string;
  forType: ArtifactSchemaRef;
  mode: ParserMode;
  body: unknown;
  source: ParserSource;
  /** Optional runtime metadata: token-reduction ratios, avg duration, etc. */
  meta: Record<string, unknown>;
};

/** Payload accepted by `ParserRegistry.save()` — restricted to user parsers. */
export type SaveUserParser = {
  id: string;
  version: string;
  forType: ArtifactSchemaRef;
  mode: ParserMode;
  body: unknown;
  meta?: Record<string, unknown>;
};
