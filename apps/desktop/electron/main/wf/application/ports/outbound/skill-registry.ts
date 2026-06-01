/**
 * Port for resolving {@link SkillRef}s to full {@link Skill}s. The MVP ships an
 * in-code registry; a future adapter could load Skills from disk or a Git repo.
 */
import type { SkillRef } from "../../../domain/ids";
import type { Skill } from "../../../domain/skill";

export interface SkillRegistry {
  /** Resolves a `name@version` reference. Throws if unknown. */
  resolve(ref: SkillRef): Promise<Skill>;
  /** Lists every registered Skill (any version). */
  list(): Promise<ReadonlyArray<Skill>>;
  /** Upserts a Skill (create or update by `ref`). */
  save(skill: Skill): Promise<void>;
  /** Removes a Skill by `ref`. No-op if unknown. */
  remove(ref: SkillRef): Promise<void>;
}
