import { describe, expect, it } from "vitest";
import { asSkillRef } from "../domain/ids";
import type { Skill } from "../domain/skill";
import type { SkillRegistry } from "../application/ports/outbound/skill-registry";
import { createSkillBodySnapshot } from "./skill-body-snapshot";

/** Minimal mutable in-memory registry — only `list` is exercised by the snapshot. */
const createStubRegistry = (initial: Record<string, string>) => {
  const bodies = new Map<string, string>(Object.entries(initial));
  const registry: Pick<SkillRegistry, "list"> = {
    async list(): Promise<ReadonlyArray<Skill>> {
      return [...bodies].map(([ref, body]) => ({
        ref: asSkillRef(ref),
        body,
        meta: {},
      }));
    },
  };
  return {
    registry,
    setBody: (ref: string, body: string) => bodies.set(ref, body),
    remove: (ref: string) => bodies.delete(ref),
  };
};

describe("createSkillBodySnapshot", () => {
  it("exposes a saved skill's body after warming", async () => {
    const { registry } = createStubRegistry({ "a@v1": "Analyse {{spec}}." });
    const snap = createSkillBodySnapshot(registry);
    await snap.warm();
    expect(snap.get("a@v1")).toBe("Analyse {{spec}}.");
  });

  it("returns undefined for an unknown ref", async () => {
    const { registry } = createStubRegistry({ "a@v1": "x" });
    const snap = createSkillBodySnapshot(registry);
    await snap.warm();
    expect(snap.get("missing@v1")).toBeUndefined();
  });

  it("reflects an edited body after an explicit re-warm", async () => {
    const stub = createStubRegistry({ "a@v1": "old {{x}}" });
    const snap = createSkillBodySnapshot(stub.registry);
    await snap.warm();
    expect(snap.get("a@v1")).toBe("old {{x}}");

    stub.setBody("a@v1", "new {{x}} {{y}}");
    await snap.warm();
    expect(snap.get("a@v1")).toBe("new {{x}} {{y}}");
  });

  it("drops a removed skill after a re-warm", async () => {
    const stub = createStubRegistry({ "a@v1": "x" });
    const snap = createSkillBodySnapshot(stub.registry);
    await snap.warm();
    expect(snap.get("a@v1")).toBe("x");

    stub.remove("a@v1");
    await snap.warm();
    expect(snap.get("a@v1")).toBeUndefined();
  });
});
