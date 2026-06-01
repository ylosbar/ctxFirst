import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { Skill } from "../../domain/skill";

type Deps = { skills: SkillRegistry };

export type ListSkills = () => Promise<ReadonlyArray<Skill>>;

export const makeListSkills =
  ({ skills }: Deps): ListSkills =>
  () =>
    skills.list();
