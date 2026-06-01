/**
 * Port for parser CRUD. The adapter merges plugin-contributed parsers
 * (read-only) with DB-stored user parsers. Cf. PLUGINS.md §7.5.
 *
 * The legacy "active parser per type" pointer is gone: parsers are now
 * invoked explicitly through a `transform.run` step (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B).
 */
import type {
  ParserMode,
  ParserRecord,
  ParserRef,
  SaveUserParser,
} from "../../../domain/parser";
import type { ArtifactSchemaRef } from "../../../domain/artifact-schema";

/** One plugin's parser contributions, snapshotted at construction time. */
export type PluginParserContribution = {
  pluginId: string;
  parsers: ReadonlyArray<{
    id: string;
    version: string;
    forType: ArtifactSchemaRef;
    mode: ParserMode;
    body: unknown;
    meta?: Record<string, unknown>;
  }>;
};

export interface ParserRegistry {
  /** Lists every parser (plugin + user). Filter by target type if provided. */
  list(forType?: ArtifactSchemaRef): ReadonlyArray<ParserRecord>;
  /** Resolves a specific parser version. Returns `null` if unknown. */
  resolve(ref: ParserRef): ParserRecord | null;
  /** Upsert a user-defined parser. Rejects plugin-sourced parsers. */
  save(parser: SaveUserParser): Promise<void>;
  /** Deletes a user-defined parser. Rejects plugin-sourced parsers. */
  remove(ref: ParserRef): Promise<void>;
  /**
   * Replaces the current set of plugin contributions. Called from the
   * composition root after the plugin loader has run.
   */
  setPluginContributions(
    contributions: ReadonlyArray<PluginParserContribution>,
  ): void;
}
