import { describe, expect, it } from "vitest";
import { makeSaveSkill } from "./save-skill";
import { createFakeSkillRegistry } from "../../__tests__/fixtures/fake-registries";
import { asSkillRef } from "../../domain/ids";

const buildDeps = () => {
  const skills = createFakeSkillRegistry();
  return { skills, save: makeSaveSkill({ skills }) };
};

describe("saveSkill use-case", () => {
  it("persists a valid skill", async () => {
    const { skills, save } = buildDeps();
    await save({
      ref: asSkillRef("my-skill"),
      body: "system prompt",
      meta: {},
    });
    expect((await skills.list())).toHaveLength(1);
  });

  it("rejects an empty ref", async () => {
    const { skills, save } = buildDeps();
    await expect(
      save({ ref: asSkillRef("   "), body: "x", meta: {} }),
    ).rejects.toThrow(/skill ref is required/);
    expect(await skills.list()).toHaveLength(0);
  });

  it("rejects an empty body", async () => {
    const { skills, save } = buildDeps();
    await expect(
      save({ ref: asSkillRef("ok"), body: "   ", meta: {} }),
    ).rejects.toThrow(/skill body is required/);
    expect(await skills.list()).toHaveLength(0);
  });
});
