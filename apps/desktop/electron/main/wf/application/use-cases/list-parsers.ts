import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { ParserRecord } from "../../domain/parser";
import type { ArtifactSchemaRef } from "../../domain/artifact-schema";

type Deps = { parsers: ParserRegistry };

export type ListParsers = (
  forType?: ArtifactSchemaRef,
) => Promise<ReadonlyArray<ParserRecord>>;

/**
 * Lists parsers, optionally filtered by target type. Pure projection of the
 * registry — the legacy `isActive` field is gone (parser-as-option has been
 * replaced by explicit `transform.run` nodes, cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B).
 */
export const makeListParsers =
  ({ parsers }: Deps): ListParsers =>
  async (forType) => parsers.list(forType);
