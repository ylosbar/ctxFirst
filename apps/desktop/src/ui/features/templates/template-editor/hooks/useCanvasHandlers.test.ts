import { describe, expect, it } from "vitest";

import { entryStepIdAfterRemoval } from "./useCanvasHandlers";

describe("entryStepIdAfterRemoval", () => {
  it("remet l'entrée à null quand elle est supprimée", () => {
    expect(entryStepIdAfterRemoval(["step-1", "step-2"], "step-1")).toBeNull();
  });

  it("préserve l'entrée quand elle n'est pas dans la suppression", () => {
    expect(entryStepIdAfterRemoval(["step-2", "step-3"], "step-1")).toBe(
      "step-1",
    );
  });

  it("reste null quand il n'y a pas d'entrée", () => {
    expect(entryStepIdAfterRemoval(["step-1"], null)).toBeNull();
  });

  it("préserve l'entrée sur une suppression vide", () => {
    expect(entryStepIdAfterRemoval([], "step-1")).toBe("step-1");
  });
});
