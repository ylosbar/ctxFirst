import { describe, expect, it } from "vitest";
import { makeGetSkill } from "./get-skill";
import { createFakeSkillRegistry } from "../../__tests__/fixtures/fake-registries";
import { asSkillRef } from "../../domain/ids";

describe("getSkill use-case", () => {
  it("resolves a skill by ref via the registry", async () => {
    const skills = createFakeSkillRegistry();
    await skills.save({ ref: asSkillRef("s1"), body: "x", meta: {} });
    const get = makeGetSkill({ skills });
    const skill = await get(asSkillRef("s1"));
    expect(skill.body).toBe("x");
  });

  it("propagates the registry error when the ref is unknown", async () => {
    const skills = createFakeSkillRegistry();
    const get = makeGetSkill({ skills });
    await expect(get(asSkillRef("ghost"))).rejects.toThrow();
  });
});
