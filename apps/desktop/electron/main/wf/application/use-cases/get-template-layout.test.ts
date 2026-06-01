import { describe, expect, it } from "vitest";
import { makeGetTemplateLayout } from "./get-template-layout";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

describe("getTemplateLayout use-case", () => {
  it("returns null when no layout has been persisted", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const get = makeGetTemplateLayout({ templates });
    const out = await get(`${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`);
    expect(out).toBeNull();
  });

  it("returns the saved layout", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    await templates.saveLayout(TEMPLATE_LINEAR.id, TEMPLATE_LINEAR.version, {
      positions: { input: { x: 1, y: 2 } },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const get = makeGetTemplateLayout({ templates });
    const out = await get(`${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`);
    expect(out?.positions.input).toEqual({ x: 1, y: 2 });
  });

  it("rejects an invalid ref", async () => {
    const templates = createFakeTemplateRegistry();
    const get = makeGetTemplateLayout({ templates });
    await expect(get("noversion")).rejects.toThrow(/invalid template ref/);
  });
});
