import { describe, expect, it } from "vitest";

import { classifyHistoryKey, isEditableTarget } from "./useHistoryHotkeys";

const key = (
  over: Partial<{
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  }> = {},
) => ({ key: "z", metaKey: false, ctrlKey: false, shiftKey: false, ...over });

describe("classifyHistoryKey", () => {
  it("Ctrl+Z / Cmd+Z → undo", () => {
    expect(classifyHistoryKey(key({ ctrlKey: true }))).toBe("undo");
    expect(classifyHistoryKey(key({ metaKey: true }))).toBe("undo");
  });

  it("Ctrl+Shift+Z / Cmd+Shift+Z → redo", () => {
    expect(classifyHistoryKey(key({ ctrlKey: true, shiftKey: true }))).toBe(
      "redo",
    );
    expect(classifyHistoryKey(key({ metaKey: true, shiftKey: true }))).toBe(
      "redo",
    );
  });

  it("Ctrl+Y → redo, mais pas Cmd+Y", () => {
    expect(classifyHistoryKey(key({ key: "y", ctrlKey: true }))).toBe("redo");
    expect(classifyHistoryKey(key({ key: "y", metaKey: true }))).toBeNull();
  });

  it("insensible à la casse de la touche", () => {
    expect(classifyHistoryKey(key({ key: "Z", ctrlKey: true }))).toBe("undo");
  });

  it("ignore Z sans modificateur ou une autre touche", () => {
    expect(classifyHistoryKey(key())).toBeNull();
    expect(classifyHistoryKey(key({ key: "a", ctrlKey: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("détecte input / textarea / select", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
  });

  it("détecte un contentEditable", () => {
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
  });

  it("ignore un élément non éditable ou null", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
