import { describe, expect, it } from "vitest";
import { makeListSkills } from "./list-skills";
import { createFakeSkillRegistry } from "../../__tests__/fixtures/fake-registries";
import { asSkillRef } from "../../domain/ids";

describe("listSkills use-case", () => {
  it("forwards to the registry and returns every skill", async () => {
    const skills = createFakeSkillRegistry();
    await skills.save({ ref: asSkillRef("s1"), body: "x", meta: {} });
    const list = makeListSkills({ skills });
    const all = await list();
    expect(all).toHaveLength(1);
    expect(all[0].ref).toBe(asSkillRef("s1"));
  });
});
