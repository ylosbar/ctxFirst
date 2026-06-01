import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArtifactSchemaRegistry } from "../../application/ports/outbound/artifact-schema-registry";
import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../../domain/artifact-errors";
import { parseArtifact } from "../../domain/parse-artifact";
import {
  BUILTIN_DESCRIPTORS,
  BUILTIN_DESCRIPTORS_BY_KIND,
} from "../../domain/BuiltIns";
import { plainFallback } from "../../domain/artifact-serializer";
import type { ArtifactKind } from "../../domain/artifact";
import { createFsArtifactStore } from "./fs-store";

/**
 * Minimal stand-in for the production `SqliteArtifactSchemaRegistry`. Built-ins
 * only; no plugin/user contributions. Routes every lookup through
 * `BUILTIN_DESCRIPTORS_BY_KIND`.
 */
const createBuiltinOnlyRegistry = (): ArtifactSchemaRegistry => {
  const registry: ArtifactSchemaRegistry = {
    list: () => [...BUILTIN_DESCRIPTORS],
    resolve: (kind: ArtifactKind) =>
      BUILTIN_DESCRIPTORS_BY_KIND.get(kind) ?? null,
    getSchema: (kind: ArtifactKind) =>
      BUILTIN_DESCRIPTORS_BY_KIND.get(kind)?.schema ?? null,
    validate(kind: ArtifactKind, rawContent: string) {
      const descriptor = BUILTIN_DESCRIPTORS_BY_KIND.get(kind);
      if (!descriptor) {
        return { ok: false, error: new UnknownArtifactKindError(kind) };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        try {
          parsed = plainFallback(kind, rawContent);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            error: new ArtifactSchemaError(kind, [
              {
                code: "custom",
                path: [],
                message: `unable to decode raw content: ${message}`,
              } as never,
            ]),
          };
        }
      }
      try {
        parseArtifact(registry, kind, parsed);
        return { ok: true };
      } catch (err) {
        if (
          err instanceof ArtifactSchemaError ||
          err instanceof UnknownArtifactKindError
        ) {
          return { ok: false, error: err };
        }
        throw err;
      }
    },
    save: async () => undefined,
    remove: async () => undefined,
    setPluginContributions: () => undefined,
  };
  return registry;
};

const counterIdGenerator = () => {
  let n = 0;
  return {
    newId: () => `id-${++n}`,
  };
};

const fixedClock = () => ({ now: () => "2026-05-24T00:00:00.000Z" });

const PAYLOAD_FORMAT_JSON_V1 = "json-v1";

describe("createFsArtifactStore — validation at put", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-artifacts-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  const buildStore = () =>
    createFsArtifactStore({
      rootDir,
      clock: fixedClock(),
      ids: counterIdGenerator(),
      artifactSchemas: createBuiltinOnlyRegistry(),
    });

  it("accepts a well-formed JSON payload tagged json-v1", async () => {
    const store = buildStore();
    const json = JSON.stringify({ format: "markdown", body: "hello" });
    const artifact = await store.put("Markdown", json, {
      payloadFormat: PAYLOAD_FORMAT_JSON_V1,
    });
    expect(artifact.kind).toBe("Markdown");
    const entries = await fs.readdir(rootDir);
    // One .bin + one .meta.json per artifact.
    expect(entries.filter((n) => n.endsWith(".bin"))).toHaveLength(1);
    expect(entries.filter((n) => n.endsWith(".meta.json"))).toHaveLength(1);
  });

  it("accepts raw text seeds for envelope kinds (Markdown body)", async () => {
    const store = buildStore();
    // Mirrors what `start-instance` writes for a Markdown seed: raw body,
    // no payloadFormat. `plainFallback` lifts it into the envelope shape.
    const artifact = await store.put("Markdown", "n'importe quoi", {
      role: "seed",
    });
    expect(artifact.kind).toBe("Markdown");
  });

  it("rejects garbage on an unknown kind with UnknownArtifactKindError", async () => {
    const store = buildStore();
    await expect(
      store.put("user:does-not-exist@1", "anything"),
    ).rejects.toBeInstanceOf(UnknownArtifactKindError);
    const entries = await fs.readdir(rootDir).catch(() => [] as string[]);
    expect(entries).toEqual([]);
  });

  it("rejects a malformed JSON payload with ArtifactSchemaError", async () => {
    const store = buildStore();
    // LinearRef (§2 refinement of String) requires `{ value: string matching
    // /^[A-Z]+-\d+$/ }`. Garbage JSON satisfies neither field nor format.
    await expect(
      store.put("LinearRef", JSON.stringify({ foo: "bar" })),
    ).rejects.toBeInstanceOf(ArtifactSchemaError);
  });

  it("leaves no .bin / .meta.json behind when validation fails", async () => {
    const store = buildStore();
    await expect(
      store.put("LinearRef", JSON.stringify({ value: "not-a-ticket" })),
    ).rejects.toBeInstanceOf(ArtifactSchemaError);
    const entries = await fs.readdir(rootDir).catch(() => [] as string[]);
    expect(entries).toEqual([]);
  });

  it("skipValidation bypasses schema enforcement (LLM repair-loop escape hatch)", async () => {
    const store = buildStore();
    const artifact = await store.put(
      "LinearRef",
      JSON.stringify({ value: "not-a-ticket" }),
      { payloadFormat: PAYLOAD_FORMAT_JSON_V1 },
      { skipValidation: true },
    );
    expect(artifact.kind).toBe("LinearRef");
    const entries = await fs.readdir(rootDir);
    expect(entries.filter((n) => n.endsWith(".bin"))).toHaveLength(1);
  });

  it("dedupes by hash on a successful put with identical content", async () => {
    const store = buildStore();
    const json = JSON.stringify({ format: "markdown", body: "shared" });
    const a = await store.put("Markdown", json, {
      payloadFormat: PAYLOAD_FORMAT_JSON_V1,
    });
    const b = await store.put("Markdown", json, {
      payloadFormat: PAYLOAD_FORMAT_JSON_V1,
    });
    expect(a.id).toBe(b.id);
  });
});
