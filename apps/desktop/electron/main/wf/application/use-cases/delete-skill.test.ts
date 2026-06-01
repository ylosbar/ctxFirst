import { describe, expect, it } from "vitest";
import { makeDeleteSkill } from "./delete-skill";
import { createFakeSkillRegistry } from "../../__tests__/fixtures/fake-registries";
import { asSkillRef } from "../../domain/ids";

describe("deleteSkill use-case", () => {
  it("removes an existing skill", async () => {
    const skills = createFakeSkillRegistry();
    await skills.save({ ref: asSkillRef("s1"), body: "x", meta: {} });
    const remove = makeDeleteSkill({ skills });
    await remove(asSkillRef("s1"));
    expect(await skills.list()).toHaveLength(0);
  });

  it("is idempotent on an absent ref", async () => {
    const skills = createFakeSkillRegistry();
    const remove = makeDeleteSkill({ skills });
    await expect(remove(asSkillRef("ghost"))).resolves.toBeUndefined();
  });
});
