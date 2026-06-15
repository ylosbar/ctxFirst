import { describe, expect, it } from "vitest";
import {
  loadAndParseArtifact,
  pickCoercionTarget,
  putArtifactPayload,
} from "./artifact-io";
import { createFakeArtifactStore } from "../__tests__/fixtures/fake-artifact-store";
import { createFakeArtifactSchemaRegistry } from "../__tests__/fixtures/fake-registries";
import { createSilentLogger } from "../__tests__/fixtures/fake-logger";
import type { ArtifactKind } from "../domain/artifact";
import type { CoerceFrom, DeclarativePatch } from "../domain/artifact-coercion";
import { ArtifactSchemaError } from "../domain/artifact-errors";

const objSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required, additionalProperties: false });

const renamePatch: DeclarativePatch = [
  { op: "rename", from: "summary", at: "abstract" },
];

/** Stands up a registry with `Brief@v1 { summary }` and `Brief@v2 { abstract }`,
 * where @v2 declares a `coerceFrom` v1 rename. */
const briefRegistry = async () => {
  const registry = createFakeArtifactSchemaRegistry();
  await registry.save({
    id: "Brief",
    version: "v1",
    name: "Brief",
    simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
  });
  await registry.save({
    id: "Brief",
    version: "v2",
    name: "Brief",
    simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
    coerceFrom: { fromVersion: "v1", patch: renamePatch },
  });
  return registry;
};

describe("loadAndParseArtifact — read-time coercion", () => {
  it("coerces a v1 payload to the consumer's v2 target", async () => {
    const registry = await briefRegistry();
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1", // orchestrator passes the writer's own kind
      "strict",
      createSilentLogger(),
      ["user:Brief@v2"], // consumer port declares only @v2
    );

    expect(loaded.kind).toBe("user:Brief@v2");
    expect(loaded.payload).toEqual({ abstract: "hello" });
    // Stored bytes are untouched — only the in-memory view is reshaped.
    expect(loaded.content).toBe(JSON.stringify({ summary: "hello" }));
  });

  it("does NOT coerce when the port already accepts the writer kind", async () => {
    const registry = await briefRegistry();
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "strict",
      createSilentLogger(),
      ["user:Brief@v1", "user:Brief@v2"] as ArtifactKind[],
    );

    expect(loaded.kind).toBe("user:Brief@v1");
    expect(loaded.payload).toEqual({ summary: "hello" });
  });

  it("does NOT coerce without coerceTargets (back-compat)", async () => {
    const registry = await briefRegistry();
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "strict",
      createSilentLogger(),
    );

    expect(loaded.kind).toBe("user:Brief@v1");
    expect(loaded.payload).toEqual({ summary: "hello" });
  });

  it("does NOT coerce a wildcard port", async () => {
    const registry = await briefRegistry();
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "strict",
      createSilentLogger(),
      ["*"],
    );

    expect(loaded.kind).toBe("user:Brief@v1");
  });

  it("does NOT coerce in 'off' mode (the rollback)", async () => {
    const registry = await briefRegistry();
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "off",
      createSilentLogger(),
      ["user:Brief@v2"],
    );

    expect(loaded.kind).toBe("user:Brief@v1");
    expect(loaded.payload).toBeNull();
  });

  it("throws in strict mode when the coerced payload fails v2 validation", async () => {
    // @v2 requires `abstract`, but this patch leaves the v1 `summary` in place.
    const registry = createFakeArtifactSchemaRegistry();
    await registry.save({
      id: "Brief",
      version: "v1",
      name: "Brief",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
    });
    await registry.save({
      id: "Brief",
      version: "v2",
      name: "Brief",
      simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
      coerceFrom: {
        fromVersion: "v1",
        patch: [{ op: "set", at: "noop", value: 1 }],
      },
      // Deliberately unsound coercion — persisted via allowBreaking so this test
      // can exercise the READ path's strict-mode failure (the save-time chain
      // gate would otherwise reject it).
      allowBreaking: true,
    });
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    await expect(
      loadAndParseArtifact(
        store,
        registry,
        a.id,
        "user:Brief@v1",
        "strict",
        createSilentLogger(),
        ["user:Brief@v2"],
      ),
    ).rejects.toBeInstanceOf(ArtifactSchemaError);
  });

  it("degrades to null payload in log-only when coercion produces an invalid payload", async () => {
    const registry = createFakeArtifactSchemaRegistry();
    await registry.save({
      id: "Brief",
      version: "v1",
      name: "Brief",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
    });
    await registry.save({
      id: "Brief",
      version: "v2",
      name: "Brief",
      simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
      coerceFrom: { fromVersion: "v1", patch: [] },
      // Deliberately unsound (empty patch can't fill `abstract`) — persisted via
      // allowBreaking so this test can exercise the READ path's log-only path.
      allowBreaking: true,
    });
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "log-only",
      createSilentLogger(),
      ["user:Brief@v2"],
    );
    expect(loaded.kind).toBe("user:Brief@v2");
    expect(loaded.payload).toBeNull();
  });

  it("coerces a v1 payload through a 2-hop chain to the v3 target", async () => {
    // Brief@v1{summary} → v2{abstract} (rename) → v3{title} (rename); a v3-only
    // port reads a v1 artifact, composing both hops at the single mutation site.
    const registry = createFakeArtifactSchemaRegistry();
    await registry.save({
      id: "Brief",
      version: "v1",
      name: "Brief",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
      sample: { summary: "hello" },
    });
    await registry.save({
      id: "Brief",
      version: "v2",
      name: "Brief",
      simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
      sample: { abstract: "hello" },
      coerceFrom: {
        fromVersion: "v1",
        patch: [{ op: "rename", from: "summary", at: "abstract" }],
      },
    });
    await registry.save({
      id: "Brief",
      version: "v3",
      name: "Brief",
      simplifiedSchema: objSchema({ title: { type: "string" } }, ["title"]),
      coerceFrom: {
        fromVersion: "v2",
        patch: [{ op: "rename", from: "abstract", at: "title" }],
      },
    });
    const store = createFakeArtifactStore();
    const a = await putArtifactPayload(store, "user:Brief@v1", {
      summary: "hello",
    });

    const loaded = await loadAndParseArtifact(
      store,
      registry,
      a.id,
      "user:Brief@v1",
      "strict",
      createSilentLogger(),
      ["user:Brief@v3"],
    );

    expect(loaded.kind).toBe("user:Brief@v3");
    expect(loaded.payload).toEqual({ title: "hello" });
    // Stored bytes untouched — only the in-memory view is reshaped end-to-end.
    expect(loaded.content).toBe(JSON.stringify({ summary: "hello" }));
  });
});

describe("pickCoercionTarget", () => {
  const cf = (fromVersion: string): CoerceFrom => ({
    fromVersion,
    patch: renamePatch,
  });
  const resolve =
    (table: Record<string, CoerceFrom | null>) =>
    (kind: ArtifactKind) =>
      kind in table ? { kind, coerceFrom: table[kind] } : null;

  it("returns the target when a same-id successor declares a matching coerceFrom", () => {
    expect(
      pickCoercionTarget(
        resolve({ "user:Brief@v2": cf("v1") }),
        "user:Brief@v1",
        ["user:Brief@v2"],
      ),
    ).toEqual({ targetKind: "user:Brief@v2", patch: renamePatch });
  });

  it("returns null when the port directly accepts the writer kind", () => {
    expect(
      pickCoercionTarget(
        resolve({ "user:Brief@v2": cf("v1") }),
        "user:Brief@v1",
        ["user:Brief@v1", "user:Brief@v2"] as ArtifactKind[],
      ),
    ).toBeNull();
  });

  it("returns null when fromVersion does not match the writer version", () => {
    expect(
      pickCoercionTarget(
        resolve({ "user:Brief@v3": cf("v2") }),
        "user:Brief@v1",
        ["user:Brief@v3"],
      ),
    ).toBeNull();
  });

  it("never crosses logical ids", () => {
    expect(
      pickCoercionTarget(
        resolve({ "user:Other@v2": cf("v1") }),
        "user:Brief@v1",
        ["user:Other@v2"],
      ),
    ).toBeNull();
  });

  it("returns null for an undefined/empty candidate set", () => {
    const r = resolve({ "user:Brief@v2": cf("v1") });
    expect(pickCoercionTarget(r, "user:Brief@v1", undefined)).toBeNull();
    expect(pickCoercionTarget(r, "user:Brief@v1", [])).toBeNull();
  });

  // ── P4: multi-step chains ──────────────────────────────────────────────
  const cfP = (
    fromVersion: string,
    patch: DeclarativePatch,
  ): CoerceFrom => ({ fromVersion, patch });
  const renameAB: DeclarativePatch = [{ op: "rename", from: "summary", at: "abstract" }];
  const renameBC: DeclarativePatch = [{ op: "rename", from: "abstract", at: "title" }];

  it("walks a 2-hop chain and composes patches in writer→target order", () => {
    expect(
      pickCoercionTarget(
        resolve({
          "user:Brief@v3": cfP("v2", renameBC),
          "user:Brief@v2": cfP("v1", renameAB),
        }),
        "user:Brief@v1",
        ["user:Brief@v3"],
      ),
    ).toEqual({
      targetKind: "user:Brief@v3",
      patch: [...renameAB, ...renameBC],
    });
  });

  it("returns null when the chain never reaches the writer", () => {
    expect(
      pickCoercionTarget(
        resolve({
          "user:Brief@v3": cfP("v2", renameBC),
          "user:Brief@v2": cfP("v1", renameAB),
        }),
        "user:Brief@v0", // not on the chain
        ["user:Brief@v3"],
      ),
    ).toBeNull();
  });

  it("guards a cycle in the coerceFrom links instead of looping", () => {
    expect(
      pickCoercionTarget(
        resolve({
          "user:Brief@v2": cfP("v1", renameAB),
          "user:Brief@v1": cfP("v2", renameBC), // v1 ↔ v2 cycle
        }),
        "user:Nope@v9",
        ["user:Brief@v2"],
      ),
    ).toBeNull();
  });
});
