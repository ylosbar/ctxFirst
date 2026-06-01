/**
 * Port for parser execution. Takes a fully-resolved parser record and a raw
 * payload, returns the simplified payload. The actual interpretation depends
 * on `parser.mode`:
 *  - `"declarative"` — interpreted operations tree (Phase 1).
 *  - `"code"` — JS function in a QuickJS sandbox (Phase 3).
 *
 * Phase 1 only ships the declarative adapter; a future dispatcher will fan
 * out by mode (cf. PLUGINS.md §7.5). An adapter that doesn't support a given
 * mode rejects with a descriptive error rather than silently passing through.
 */
import type { ParserRecord } from "../../../domain/parser";

export interface ParserRuntime {
  /**
   * Runs the parser against `raw` and returns the simplified payload.
   *
   * Throws when the parser body is malformed, when an operation is applied
   * to an incompatible value (e.g. `map` on a non-array), or when the mode
   * is unsupported by this adapter. Output validation against the type's
   * `simplifiedSchema` is **not** done here — it's the caller's concern
   * (typically the `ContextAssembler`, which has access to the schema).
   */
  run(parser: ParserRecord, raw: unknown): Promise<unknown>;
}
