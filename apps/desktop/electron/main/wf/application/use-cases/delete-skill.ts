import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { SkillRef } from "../../domain/ids";

type Deps = { skills: SkillRegistry };

export type DeleteSkill = (ref: SkillRef) => Promise<void>;

export const makeDeleteSkill =
  ({ skills }: Deps): DeleteSkill =>
  (ref) =>
    skills.remove(ref);
