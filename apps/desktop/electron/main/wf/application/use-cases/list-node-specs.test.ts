import { describe, expect, it } from "vitest";
import { makeListNodeSpecs } from "./list-node-specs";
import { createHumanGateRunner } from "../../plugins/human-gate";
import { createConcatMarkdownRunner } from "../../plugins/concat-markdown";
import { createStepRunnerRegistry } from "../step-runner";

describe("listNodeSpecs use-case", () => {
  it("returns one NodeSpecView per registered runner kind", async () => {
    const runners = createStepRunnerRegistry();
    runners.register(createHumanGateRunner());
    runners.register(createConcatMarkdownRunner());
    const list = makeListNodeSpecs({ runners });
    const out = await list();
    expect(out.map((s) => s.kind).sort()).toEqual(
      ["human.gate", "concat.markdown"].sort(),
    );
    for (const v of out) {
      expect(typeof v.title).toBe("string");
      expect(Array.isArray(v.inputs)).toBe(true);
      expect(Array.isArray(v.outputs)).toBe(true);
    }
  });

  it("falls back to a permissive spec when a runner's resolveSpec throws (incomplete config)", async () => {
    const runners = createStepRunnerRegistry();
    runners.register({
      kind: "polymorphic.test",
      resolveSpec() {
        throw new Error("needs outputKind");
      },
      async run() {
        throw new Error("not used");
      },
    });
    const list = makeListNodeSpecs({ runners });
    const out = await list();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("polymorphic.test");
    expect(out[0].inputs[0].kinds).toContain("*");
  });
});
