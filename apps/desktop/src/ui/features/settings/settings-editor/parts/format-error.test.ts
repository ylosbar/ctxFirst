import { describe, expect, it } from "vitest";

import { formatError } from "./format-error";

describe("formatError", () => {
  it("returns the message of an Error instance", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("returns a string value verbatim", () => {
    expect(formatError("plain failure")).toBe("plain failure");
  });

  it("falls back to a string for unknown values", () => {
    expect(typeof formatError(42)).toBe("string");
    expect(typeof formatError({ nope: true })).toBe("string");
  });
});
