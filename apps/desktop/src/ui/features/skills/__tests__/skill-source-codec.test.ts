import { describe, expect, it } from "vitest";
import type { SkillView } from "../../../../domain/workflow/types";
import {
  EMPTY_TEMPLATE,
  NEW_SKILL_CURSOR_POS,
  skillToSource,
  sourceToSkill,
} from "../skill-source-codec";

const roundTrip = (skill: SkillView) => {
  const parsed = sourceToSkill(skillToSource(skill));
  if (!parsed.ok) throw new Error(`expected ok, got error: ${parsed.error}`);
  return parsed;
};

describe("skill-source-codec round-trip", () => {
  it("(a) nominal skill", () => {
    const skill: SkillView = {
      ref: "spec-writer",
      body: "# Skill\n\nTu rédiges une spec.",
      meta: { description: "Rédige une spec détaillée" },
    };
    const parsed = roundTrip(skill);
    expect(parsed.ref).toBe(skill.ref);
    expect(parsed.body).toBe(skill.body);
    expect(parsed.meta).toEqual(skill.meta);
  });

  it("(b) skill with rich nested meta", () => {
    const skill: SkillView = {
      ref: "rich",
      body: "body content",
      meta: {
        description: "desc",
        metadata: { type: "feedback", nested: { deep: [1, 2, 3] } },
        tags: ["a", "b"],
        enabled: true,
      },
    };
    const parsed = roundTrip(skill);
    expect(parsed.ref).toBe("rich");
    expect(parsed.meta).toEqual(skill.meta);
  });

  it("(c) body containing a triple-dash separator mid-text", () => {
    const skill: SkillView = {
      ref: "with-hr",
      body: "intro paragraph\n\n---\n\nafter the rule",
      meta: {},
    };
    const parsed = roundTrip(skill);
    expect(parsed.ref).toBe("with-hr");
    expect(parsed.body).toBe("intro paragraph\n\n---\n\nafter the rule");
    expect(parsed.meta).toEqual({});
  });

  it("(d) frontmatter with multi-line values", () => {
    const skill: SkillView = {
      ref: "multiline",
      body: "body",
      meta: { description: "ligne 1\nligne 2\nligne 3" },
    };
    const parsed = roundTrip(skill);
    expect(parsed.meta["description"]).toBe("ligne 1\nligne 2\nligne 3");
  });

  it("keeps an empty body when the skill has none", () => {
    const skill: SkillView = { ref: "empty-body", body: "", meta: {} };
    const parsed = roundTrip(skill);
    expect(parsed.body).toBe("");
  });
});

describe("sourceToSkill errors", () => {
  it("missing frontmatter", () => {
    const r = sourceToSkill("just a body, no frontmatter");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[Ff]rontmatter/);
  });

  it("invalid YAML", () => {
    const r = sourceToSkill(`---\nfoo: "unterminated\n---\n\nbody`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/YAML invalide/);
  });

  it("missing name field", () => {
    const r = sourceToSkill(`---\ndescription: hi\n---\n\nbody`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/);
  });

  it("empty name value", () => {
    const r = sourceToSkill(`---\nname:\n---\n\nbody`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/);
  });

  it("non-object frontmatter (scalar)", () => {
    const r = sourceToSkill(`---\njust a scalar\n---\n\nbody`);
    expect(r.ok).toBe(false);
  });
});

describe("EMPTY_TEMPLATE", () => {
  it("is not yet saveable (name is blank)", () => {
    expect(sourceToSkill(EMPTY_TEMPLATE).ok).toBe(false);
  });

  it("places the caret at the end of the `name: ` line", () => {
    // Caret sits on the newline that terminates the `name: ` line, i.e. right
    // after the trailing space, so the user types the slug directly.
    expect(EMPTY_TEMPLATE[NEW_SKILL_CURSOR_POS]).toBe("\n");
    expect(EMPTY_TEMPLATE.slice(0, NEW_SKILL_CURSOR_POS)).toBe("---\nname: ");
  });

  it("becomes saveable once a name is typed at the caret", () => {
    const typed =
      EMPTY_TEMPLATE.slice(0, NEW_SKILL_CURSOR_POS) +
      "my-skill" +
      EMPTY_TEMPLATE.slice(NEW_SKILL_CURSOR_POS);
    const r = sourceToSkill(typed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ref).toBe("my-skill");
  });
});
