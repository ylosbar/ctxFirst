import { describe, expect, it } from "vitest";
import {
  flattenPayload,
  renderArtifactMarkdown,
} from "./render-artifact-markdown";

describe("flattenPayload", () => {
  it("passes scalars through and JSON-encodes nested values", () => {
    const map = flattenPayload({
      title: "Hello",
      count: 3,
      done: true,
      tags: ["a", "b"],
      meta: { k: 1 },
      nothing: null,
    });
    expect(map.get("title")).toBe("Hello");
    expect(map.get("count")).toBe("3");
    expect(map.get("done")).toBe("true");
    expect(map.get("tags")).toBe('["a","b"]');
    expect(map.get("meta")).toBe('{"k":1}');
    expect(map.get("nothing")).toBe("null");
  });

  it("returns an empty map for non-records", () => {
    expect(flattenPayload(null).size).toBe(0);
    expect(flattenPayload("x").size).toBe(0);
    expect(flattenPayload([1, 2]).size).toBe(0);
  });
});

describe("renderArtifactMarkdown", () => {
  it("1. uses an explicit fn projection", () => {
    const out = renderArtifactMarkdown(
      { kind: "fn", render: (p) => `# ${(p as { title: string }).title}` },
      { title: "Foo" },
    );
    expect(out).toBe("# Foo");
  });

  it("2. renders a template projection with {{field}} substitution", () => {
    const out = renderArtifactMarkdown(
      { kind: "template", template: "## {{title}}\n{{summary}}" },
      { title: "Foo", summary: "Bar" },
    );
    expect(out).toBe("## Foo\nBar");
  });

  it("2b. substitutes a missing template field with empty string", () => {
    const out = renderArtifactMarkdown(
      { kind: "template", template: "## {{title}}\n{{missing}}" },
      { title: "Foo" },
    );
    expect(out).toBe("## Foo\n");
  });

  it("3. falls back to an embedded renderedMarkdown field", () => {
    const out = renderArtifactMarkdown(null, {
      renderedMarkdown: "# Ticket body",
      other: 1,
    });
    expect(out).toBe("# Ticket body");
  });

  it("4. falls back to a text envelope body", () => {
    const out = renderArtifactMarkdown(null, {
      format: "markdown",
      body: "plain body",
    });
    expect(out).toBe("plain body");
  });

  it("5. last resort pretty-prints JSON in a fenced block", () => {
    const out = renderArtifactMarkdown(null, { a: 1, b: [2] });
    expect(out).toBe('```json\n{\n  "a": 1,\n  "b": [\n    2\n  ]\n}\n```');
  });

  it("prefers the projection over an embedded renderedMarkdown", () => {
    const out = renderArtifactMarkdown(
      { kind: "fn", render: () => "from fn" },
      { renderedMarkdown: "embedded" },
    );
    expect(out).toBe("from fn");
  });
});
