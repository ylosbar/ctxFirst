import { describe, expect, it } from "vitest";
import {
  AGENT_BACKENDS,
  DEFAULT_AGENT_PROVIDER,
  defaultModelFor,
  isKnownProvider,
} from "./agent-backends";

describe("agent-backends registry", () => {
  it("exposes at least claude-code and codex", () => {
    const ids = AGENT_BACKENDS.map((b) => b.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("codex");
  });

  it("has unique provider ids", () => {
    const ids = AGENT_BACKENDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to claude-code", () => {
    expect(DEFAULT_AGENT_PROVIDER).toBe("claude-code");
    expect(isKnownProvider(DEFAULT_AGENT_PROVIDER)).toBe(true);
  });

  describe("isKnownProvider", () => {
    it("is true for every registered id", () => {
      for (const b of AGENT_BACKENDS) {
        expect(isKnownProvider(b.id)).toBe(true);
      }
    });

    it("is false for unknown / non-string values", () => {
      expect(isKnownProvider("gpt-4")).toBe(false);
      expect(isKnownProvider("")).toBe(false);
      expect(isKnownProvider(undefined)).toBe(false);
      expect(isKnownProvider(null)).toBe(false);
      expect(isKnownProvider(42)).toBe(false);
    });
  });

  describe("defaultModelFor", () => {
    it("preserves the legacy runner defaults", () => {
      expect(defaultModelFor("claude-code")).toBe("claude-opus-4-7");
      expect(defaultModelFor("codex")).toBe("gpt-5-codex");
    });

    it("returns a non-empty model for every registered provider", () => {
      for (const b of AGENT_BACKENDS) {
        expect(defaultModelFor(b.id)).toBe(b.defaultModel);
        expect(defaultModelFor(b.id).length).toBeGreaterThan(0);
      }
    });
  });
});
