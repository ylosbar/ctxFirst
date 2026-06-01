import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { SkillRef } from "../../domain/ids";
import type { Skill } from "../../domain/skill";

type Deps = { skills: SkillRegistry };

export type GetSkill = (ref: SkillRef) => Promise<Skill>;

export const makeGetSkill =
  ({ skills }: Deps): GetSkill =>
  (ref) =>
    skills.resolve(ref);
