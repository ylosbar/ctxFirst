import { describe, expect, it } from "vitest";
import { makeSaveTemplateLayout } from "./save-template-layout";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

describe("saveTemplateLayout use-case", () => {
  it("persists a valid layout", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const save = makeSaveTemplateLayout({ templates });
    await save({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      layout: {
        positions: { input: { x: 0, y: 0 } },
        viewport: { x: 1, y: 2, zoom: 1 },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const layout = await templates.getLayout(
      TEMPLATE_LINEAR.id,
      TEMPLATE_LINEAR.version,
    );
    expect(layout?.positions.input).toEqual({ x: 0, y: 0 });
  });

  it("rejects an invalid templateRef", async () => {
    const templates = createFakeTemplateRegistry();
    const save = makeSaveTemplateLayout({ templates });
    await expect(
      save({
        templateRef: "no-version",
        layout: { positions: {}, updatedAt: "2026-01-01T00:00:00.000Z" },
      }),
    ).rejects.toThrow(/invalid template ref/);
  });

  it("rejects a position whose coordinates are not finite numbers", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const save = makeSaveTemplateLayout({ templates });
    await expect(
      save({
        templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
        layout: {
          positions: { input: { x: Number.NaN, y: 0 } },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/invalid layout position/);
  });

  it("rejects a viewport with zoom ≤ 0", async () => {
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const save = makeSaveTemplateLayout({ templates });
    await expect(
      save({
        templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
        layout: {
          positions: {},
          viewport: { x: 0, y: 0, zoom: 0 },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/invalid layout viewport/);
  });
});
