import { describe, expect, it } from "vitest";
import { makeRenameTemplate } from "./rename-template";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

describe("renameTemplate use-case", () => {
  it("renames an existing template", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const rename = makeRenameTemplate({ templates });
    await rename({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      newName: "New Name",
    });
    expect(
      templates.getById(TEMPLATE_LINEAR.id, TEMPLATE_LINEAR.version)?.name,
    ).toBe("New Name");
  });

  it("trims the new name", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const rename = makeRenameTemplate({ templates });
    await rename({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      newName: "   Trimmed   ",
    });
    expect(
      templates.getById(TEMPLATE_LINEAR.id, TEMPLATE_LINEAR.version)?.name,
    ).toBe("Trimmed");
  });

  it("rejects an empty new name", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const rename = makeRenameTemplate({ templates });
    await expect(
      rename({
        templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
        newName: "   ",
      }),
    ).rejects.toThrow(/template name is required/);
  });

  it("rejects an invalid ref", async () => {
    const templates = createFakeTemplateRegistry();
    const rename = makeRenameTemplate({ templates });
    await expect(
      rename({ templateRef: "no-version", newName: "x" }),
    ).rejects.toThrow(/invalid template ref/);
  });
});
