import { describe, expect, it } from "vitest";
import { extractDisplayableContent } from "./display-content";

describe("extractDisplayableContent", () => {
  it("returns the body of a markdown envelope verbatim", () => {
    const raw = JSON.stringify({ format: "markdown", body: "# Hi\n\nthere" });
    expect(extractDisplayableContent(raw)).toBe("# Hi\n\nthere");
  });

  it("does not reformat a markdown body that happens to contain JSON-ish text", () => {
    const body = '{"a":1} and some prose';
    const raw = JSON.stringify({ format: "markdown", body });
    expect(extractDisplayableContent(raw)).toBe(body);
  });

  it("pretty-prints a minified JSON body", () => {
    const raw = JSON.stringify({ format: "json", body: '{"a":1,"b":[2,3]}' });
    expect(extractDisplayableContent(raw)).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    );
  });

  it("strips a ```json fence then pretty-prints", () => {
    const body = '```json\n{"a":1}\n```';
    const raw = JSON.stringify({ format: "json", body });
    expect(extractDisplayableContent(raw)).toBe('{\n  "a": 1\n}');
  });

  it("strips a bare ``` fence then pretty-prints", () => {
    const body = '```\n{"a":1}\n```';
    const raw = JSON.stringify({ format: "json", body });
    expect(extractDisplayableContent(raw)).toBe('{\n  "a": 1\n}');
  });

  it("is idempotent on already pretty-printed JSON", () => {
    const pretty = '{\n  "a": 1\n}';
    const raw = JSON.stringify({ format: "json", body: pretty });
    expect(extractDisplayableContent(raw)).toBe(pretty);
  });

  it("leaves a JSON body with surrounding prose untouched", () => {
    const body = 'Voici le résultat :\n{"a":1}';
    const raw = JSON.stringify({ format: "json", body });
    expect(extractDisplayableContent(raw)).toBe(body);
  });

  it("leaves an unparseable JSON body untouched", () => {
    const body = "{not valid json";
    const raw = JSON.stringify({ format: "json", body });
    expect(extractDisplayableContent(raw)).toBe(body);
  });

  it("returns renderedMarkdown for plugin records", () => {
    const raw = JSON.stringify({ renderedMarkdown: "## Ticket\nbody" });
    expect(extractDisplayableContent(raw)).toBe("## Ticket\nbody");
  });

  it("falls back to raw content for non-JSON input", () => {
    expect(extractDisplayableContent("plain text")).toBe("plain text");
  });
});
