import { describe, expect, it } from "vitest";
import { buildTemplateInvokeSnapshot } from "./template-invoke-closure";
import { buildTemplate } from "../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../__tests__/fixtures/fake-registries";

const invoke = (id: string, ref: { id: string; version: string }) => ({
  id,
  kind: "template.invoke",
  config: { templateId: ref.id, templateVersion: ref.version },
});

describe("buildTemplateInvokeSnapshot (§7)", () => {
  it("returns an empty map for a template with no template.invoke (Phase A)", async () => {
    const root = buildTemplate("root", [{ id: "a", kind: "user.input" }], []);
    const registry = createFakeTemplateRegistry([root]);
    const snap = await buildTemplateInvokeSnapshot(registry, root);
    expect(snap.size).toBe(0);
  });

  it("resolves the transitive closure, keyed id@version, excluding root", async () => {
    const grandchild = buildTemplate("gc", [{ id: "g", kind: "user.input" }], [], {
      version: "v1",
    });
    const child = buildTemplate(
      "child",
      [invoke("c", { id: "gc", version: "v1" })],
      [],
      { version: "v2" },
    );
    const root = buildTemplate(
      "root",
      [invoke("r", { id: "child", version: "v2" })],
      [],
    );
    const registry = createFakeTemplateRegistry([root, child, grandchild]);

    const snap = await buildTemplateInvokeSnapshot(registry, root);

    expect([...snap.keys()].sort()).toEqual(["child@v2", "gc@v1"]);
    expect(snap.get("child@v2")).toBe(child);
    expect(snap.get("gc@v1")).toBe(grandchild);
    expect(snap.has("root@v1")).toBe(false);
  });

  it("visits a repeated / cyclic ref only once (dedup terminates)", async () => {
    // A → B → A: the cycle is visited once and terminates via dedup. Rejecting
    // the cycle is a separate validation concern (§14), not this builder's job.
    const a = buildTemplate("a", [invoke("s", { id: "b", version: "v1" })], [], {
      version: "v1",
    });
    const b = buildTemplate("b", [invoke("s", { id: "a", version: "v1" })], [], {
      version: "v1",
    });
    const registry = createFakeTemplateRegistry([a, b]);

    const snap = await buildTemplateInvokeSnapshot(registry, a);

    expect([...snap.keys()].sort()).toEqual(["a@v1", "b@v1"]);
  });

  it("throws when a referenced sub-template is absent from the registry", async () => {
    const root = buildTemplate(
      "root",
      [invoke("r", { id: "missing", version: "v1" })],
      [],
    );
    const registry = createFakeTemplateRegistry([root]);
    await expect(buildTemplateInvokeSnapshot(registry, root)).rejects.toThrow(
      /unknown template missing@v1/,
    );
  });
});
