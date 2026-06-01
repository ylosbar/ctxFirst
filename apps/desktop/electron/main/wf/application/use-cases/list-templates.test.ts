import { describe, expect, it } from "vitest";
import { makeListTemplates } from "./list-templates";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

describe("listTemplates use-case", () => {
  it("forwards to the registry and returns every template", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const list = makeListTemplates({ templates });
    expect(await list()).toHaveLength(1);
    expect((await list())[0].id).toBe(TEMPLATE_LINEAR.id);
  });
});
