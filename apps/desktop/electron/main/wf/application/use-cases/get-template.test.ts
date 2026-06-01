import { describe, expect, it } from "vitest";
import { makeGetTemplate } from "./get-template";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

describe("getTemplate use-case", () => {
  it("resolves a template by ref via the registry", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const get = makeGetTemplate({ templates });
    const tpl = await get(`${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`);
    expect(tpl.id).toBe(TEMPLATE_LINEAR.id);
  });

  it("propagates the registry error when the ref is unknown", async () => {
    const templates = createFakeTemplateRegistry();
    const get = makeGetTemplate({ templates });
    await expect(get("ghost@v1")).rejects.toThrow();
  });
});
