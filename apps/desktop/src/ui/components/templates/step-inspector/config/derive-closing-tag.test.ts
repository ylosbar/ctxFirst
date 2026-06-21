import { describe, expect, it } from "vitest";

import { closingTagFor } from "./derive-closing-tag";

describe("closingTagFor", () => {
  it("derives the closing tag for a lone opening tag", () => {
    expect(closingTagFor("<nom>")).toBe("</nom>");
  });

  it("ignores surrounding whitespace", () => {
    expect(closingTagFor("  <section>\n")).toBe("</section>");
  });

  it("keeps only the element name, dropping attributes", () => {
    expect(closingTagFor('<a href="x">')).toBe("</a>");
  });

  it("supports names with namespaces, digits and hyphens", () => {
    expect(closingTagFor("<my-tag:1>")).toBe("</my-tag:1>");
  });

  it("returns null for self-closing tags", () => {
    expect(closingTagFor("<br/>")).toBeNull();
    expect(closingTagFor("<br />")).toBeNull();
  });

  it("returns null for an already-closing tag", () => {
    expect(closingTagFor("</nom>")).toBeNull();
  });

  it("returns null for plain text or markdown", () => {
    expect(closingTagFor("# Title")).toBeNull();
    expect(closingTagFor("")).toBeNull();
    expect(closingTagFor("<nom> trailing")).toBeNull();
  });

  it("returns null for several tags", () => {
    expect(closingTagFor("<a><b>")).toBeNull();
  });
});
