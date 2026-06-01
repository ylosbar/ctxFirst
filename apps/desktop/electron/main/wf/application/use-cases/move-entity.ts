// eslint-disable-next-line no-restricted-imports -- TODO(dette technique) : remplacer ce type-only `Database` par un port outbound (cf. ARCHITECTURE.md §5) pour rompre la dépendance application → better-sqlite3.
import type Database from "better-sqlite3";

export type MovableEntityKind = "template" | "skill" | "artifactSchema" | "parser";

export type MoveEntityInput = {
  kind: MovableEntityKind;
  /**
   * Entity reference. For templates/types/parsers (composite primary key)
   * use `{ id, version }`; for skills use `{ ref }`.
   */
  ref:
    | { id: string; version: string; ref?: never }
    | { ref: string; id?: never; version?: never };
  /** Target channel id, or `null` to make the entity global. */
  channelId: string | null;
};

type Deps = { db: Database.Database };

export type MoveEntity = (input: MoveEntityInput) => Promise<void>;

/**
 * Updates the `channel_id` column of a single scopable entity. Centralised
 * here so the IPC layer doesn't need a handler per kind, and so the rules
 * (which tables key on which columns) live in one place.
 */
export const makeMoveEntity =
  ({ db }: Deps): MoveEntity =>
  async ({ kind, ref, channelId }: MoveEntityInput) => {
    switch (kind) {
      case "template": {
        if (!("id" in ref) || !ref.id || !ref.version) {
          throw new Error("template ref requires { id, version }");
        }
        db.prepare(
          `UPDATE wf_templates SET channel_id = ? WHERE id = ? AND version = ?`,
        ).run(channelId, ref.id, ref.version);
        return;
      }
      case "skill": {
        if (!("ref" in ref) || !ref.ref) {
          throw new Error("skill ref requires { ref }");
        }
        db.prepare(`UPDATE wf_skills SET channel_id = ? WHERE ref = ?`).run(
          channelId,
          ref.ref,
        );
        return;
      }
      case "artifactSchema": {
        if (!("id" in ref) || !ref.id || !ref.version) {
          throw new Error("artifactSchema ref requires { id, version }");
        }
        db.prepare(
          `UPDATE wf_artifact_schemas SET channel_id = ? WHERE id = ? AND version = ?`,
        ).run(channelId, ref.id, ref.version);
        return;
      }
      case "parser": {
        if (!("id" in ref) || !ref.id || !ref.version) {
          throw new Error("parser ref requires { id, version }");
        }
        db.prepare(
          `UPDATE wf_parsers SET channel_id = ? WHERE id = ? AND version = ?`,
        ).run(channelId, ref.id, ref.version);
        return;
      }
      default: {
        const exhaustive: never = kind;
        throw new Error(`unknown movable entity kind: ${exhaustive}`);
      }
    }
  };
