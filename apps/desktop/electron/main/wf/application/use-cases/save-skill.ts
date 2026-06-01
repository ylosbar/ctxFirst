import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { Skill } from "../../domain/skill";

type Deps = { skills: SkillRegistry };

export type SaveSkill = (skill: Skill) => Promise<void>;

export const makeSaveSkill =
  ({ skills }: Deps): SaveSkill =>
  async (skill) => {
    const ref = String(skill.ref).trim();
    if (!ref) throw new Error("skill ref is required");
    if (!skill.body.trim()) throw new Error("skill body is required");
    await skills.save(skill);
  };
