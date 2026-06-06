import { describe, expect, it } from "vitest";

import type { McpToolParamInfo } from "@/application/ports/settings-gateway";
import { parseArgs } from "./parse-args";

const param = (
  name: string,
  kind: McpToolParamInfo["kind"],
  optional = false,
): McpToolParamInfo => ({ name, kind, optional, description: "" });

describe("parseArgs", () => {
  it("passes string values through unchanged", () => {
    expect(parseArgs([param("a", "string")], { a: "hello" })).toEqual({
      a: "hello",
    });
  });

  it("coerces number fields", () => {
    expect(parseArgs([param("n", "number")], { n: "42" })).toEqual({ n: 42 });
  });

  it("throws on an unparsable number", () => {
    expect(() => parseArgs([param("n", "number")], { n: "abc" })).toThrow();
  });

  it("coerces booleans from the literal 'true'", () => {
    expect(parseArgs([param("b", "boolean")], { b: "true" })).toEqual({
      b: true,
    });
    expect(parseArgs([param("b", "boolean")], { b: "false" })).toEqual({
      b: false,
    });
  });

  it("parses JSON fields, defaulting empty to an empty object", () => {
    expect(parseArgs([param("j", "json")], { j: '{"x":1}' })).toEqual({
      j: { x: 1 },
    });
    expect(parseArgs([param("j", "json")], { j: "" })).toEqual({ j: {} });
  });

  it("throws on malformed JSON", () => {
    expect(() => parseArgs([param("j", "json")], { j: "{bad" })).toThrow();
  });

  it("skips empty optional fields", () => {
    expect(parseArgs([param("a", "string", true)], { a: "" })).toEqual({});
  });
});
