import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { asTemplateId, asTemplateVersion } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

type Input = { templateRef: string; layout: TemplateLayout };

export type SaveTemplateLayout = (input: Input) => Promise<void>;

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

const validateLayout = (layout: TemplateLayout): void => {
  if (!layout || typeof layout !== "object") {
    throw new Error("invalid layout: expected object");
  }
  if (!layout.positions || typeof layout.positions !== "object") {
    throw new Error("invalid layout: positions must be an object");
  }
  for (const [stepId, pos] of Object.entries(layout.positions)) {
    if (!isFiniteNumber(pos?.x) || !isFiniteNumber(pos?.y)) {
      throw new Error(`invalid layout position for ${stepId}`);
    }
  }
  if (layout.viewport) {
    const { x, y, zoom } = layout.viewport;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom) || zoom <= 0) {
      throw new Error("invalid layout viewport");
    }
  }
};

export const makeSaveTemplateLayout =
  ({ templates }: Deps): SaveTemplateLayout =>
  async ({ templateRef, layout }) => {
    const [idPart, versionPart] = templateRef.split("@");
    if (!idPart || !versionPart) {
      throw new Error(`invalid template ref: ${templateRef}`);
    }
    validateLayout(layout);
    await templates.saveLayout(
      asTemplateId(idPart),
      asTemplateVersion(versionPart),
      layout,
    );
  };
