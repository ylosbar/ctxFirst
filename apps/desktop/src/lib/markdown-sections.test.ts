import { describe, expect, it } from "vitest";
import { splitTaggedSections } from "./markdown-sections";

describe("splitTaggedSections", () => {
  it("returns no sections for an empty body", () => {
    const split = splitTaggedSections("");
    expect(split.sections).toEqual([]);
    expect(split.full).toBe("");
  });

  it("returns no sections when nothing is wrapped", () => {
    const md = "# Title\n\nplain paragraph\n";
    expect(splitTaggedSections(md).sections).toEqual([]);
  });

  it("detects a single section and trims its inner content", () => {
    const split = splitTaggedSections("<spec>\nx\n</spec>");
    expect(split.sections).toEqual([
      { tag: "spec", label: "spec", content: "x" },
    ]);
  });

  it("detects multiple sibling sections", () => {
    const md = "<a>\nfoo\n</a>\ntexte\n<b>\nbar\n</b>";
    const split = splitTaggedSections(md);
    expect(split.sections).toEqual([
      { tag: "a", label: "a", content: "foo" },
      { tag: "b", label: "b", content: "bar" },
    ]);
  });

  it("keeps interstitial text only in full, never as a section", () => {
    const md = "<a>\nfoo\n</a>\ntexte\n<b>\nbar\n</b>";
    const split = splitTaggedSections(md);
    expect(split.full).toBe(md);
    expect(split.sections.some((s) => s.content.includes("texte"))).toBe(false);
  });

  it("ignores an orphan opening tag with no close", () => {
    const md = "<spec>\nx\ny\n";
    expect(splitTaggedSections(md).sections).toEqual([]);
  });

  it("matches the close to the right open with a depth counter", () => {
    const md = "<spec>\nbefore\n<spec>\ninner\n</spec>\nafter\n</spec>";
    const split = splitTaggedSections(md);
    expect(split.sections).toHaveLength(1);
    expect(split.sections[0]).toEqual({
      tag: "spec",
      label: "spec",
      content: "before\n<spec>\ninner\n</spec>\nafter",
    });
  });

  it("disambiguates duplicate sibling tags by index", () => {
    const md = "<spec>\none\n</spec>\n<spec>\ntwo\n</spec>\n<spec>\nthree\n</spec>";
    const split = splitTaggedSections(md);
    expect(split.sections.map((s) => s.label)).toEqual([
      "spec",
      "spec 2",
      "spec 3",
    ]);
    expect(split.sections.map((s) => s.tag)).toEqual(["spec", "spec", "spec"]);
  });

  it("does not match an inline tag that is not alone on its line", () => {
    const md = "<spec> texte inline </spec>";
    expect(splitTaggedSections(md).sections).toEqual([]);
  });

  it("does not match a tag carrying attributes", () => {
    const md = '<spec id="x">\ny\n</spec>';
    expect(splitTaggedSections(md).sections).toEqual([]);
  });

  it("always returns full strictly equal to the input", () => {
    const inputs = [
      "",
      "plain",
      "<spec>\nx\n</spec>",
      "<a>\nfoo\n</a>\ntexte\n<b>\nbar\n</b>",
      "<spec>\n<spec>\ninner\n</spec>\n</spec>",
    ];
    for (const md of inputs) {
      expect(splitTaggedSections(md).full).toBe(md);
    }
  });

  it("tolerates leading/trailing whitespace around tag lines", () => {
    const md = "  <spec>  \nx\n  </spec>  ";
    expect(splitTaggedSections(md).sections).toEqual([
      { tag: "spec", label: "spec", content: "x" },
    ]);
  });
});
