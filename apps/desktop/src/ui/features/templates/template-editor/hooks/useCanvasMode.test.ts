import { describe, expect, it } from "vitest";
import { SelectionMode } from "@xyflow/react";

import { deriveCanvasModeProps } from "./useCanvasMode";

describe("deriveCanvasModeProps", () => {
  it("mode drag : left-drag pan, pas de box-selection", () => {
    expect(deriveCanvasModeProps("drag", false)).toEqual({
      panOnDrag: true,
      selectionOnDrag: false,
      selectionMode: SelectionMode.Partial,
    });
  });

  it("mode select : pan au clic molette/droit, box-selection au left-drag", () => {
    expect(deriveCanvasModeProps("select", false)).toEqual({
      panOnDrag: [1, 2],
      selectionOnDrag: true,
      selectionMode: SelectionMode.Partial,
    });
  });

  it("view-run force le comportement drag même en mode select", () => {
    expect(deriveCanvasModeProps("select", true)).toEqual({
      panOnDrag: true,
      selectionOnDrag: false,
      selectionMode: SelectionMode.Partial,
    });
  });
});
