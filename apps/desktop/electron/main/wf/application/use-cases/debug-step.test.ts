import { describe, expect, it, vi } from "vitest";
import { createConcatMarkdownRunner } from "../../plugins/concat-markdown";
import { createHumanGateRunner } from "../../plugins/human-gate";
import { createUserInputRunner } from "../../plugins/user-input";
import { createStepRunnerRegistry } from "../step-runner";
import type { StepRunner } from "../step-runner";
import type { StepKindId } from "../../domain/template";
import { makeDebugStep, type DebugStepInput } from "./debug-step";

const makeStubDeps = () => {
  let n = 0;
  const ids = {
    newId: () => {
      n += 1;
      return `id-${n}`;
    },
  };
  return {
    clock: { now: () => "2026-05-23T00:00:00.000Z" },
    ids,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    hash: {
      sha256: (parts: ReadonlyArray<string>) =>
        parts.join("").split("").reverse().join("") + "-hash",
    },
    path: undefined as never,
    environment: undefined as never,
    fs: undefined as never,
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
  };
};

const buildInput = (
  partial: Partial<DebugStepInput["step"]> & { kind: StepKindId },
  inputs: DebugStepInput["inputs"] = [],
): DebugStepInput => ({
  step: {
    id: "step-1",
    name: "test",
    kind: partial.kind,
    actorRole: "Developer",
    config: partial.config ?? {},
    humanGateRequired: partial.humanGateRequired ?? false,
    writesTo: partial.writesTo,
    readsFrom: partial.readsFrom,
    note: partial.note,
  },
  inputs,
});

describe("debugStep use-case", () => {
  it("returns produced artifacts for concat.markdown", async () => {
    const runners = createStepRunnerRegistry();
    runners.register(createConcatMarkdownRunner());
    const deps = makeStubDeps();
    const debugStep = makeDebugStep({ ...deps, runners });

    const result = await debugStep(
      buildInput({ kind: "concat.markdown", config: { separator: " | " } }, [
        {
          port: "main",
          kind: "Markdown",
          content: "hello",
        },
        {
          port: "markdown1",
          kind: "Markdown",
          content: "world",
        },
      ]),
    );

    expect(result.kind).toBe("produced");
    if (result.kind !== "produced") return;
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.kind).toBe("Markdown");
    expect(result.artifacts[0]?.content).toContain("hello | world");
  });

  it("returns produced artifact for user.input", async () => {
    const runners = createStepRunnerRegistry();
    runners.register(createUserInputRunner());
    const deps = makeStubDeps();
    const debugStep = makeDebugStep({ ...deps, runners });

    const result = await debugStep(
      buildInput({ kind: "user.input", config: { outputKind: "Markdown" } }, [
        {
          port: "input",
          kind: "Markdown",
          content: "# my spec\nbody",
        },
      ]),
    );

    expect(result.kind).toBe("produced");
    if (result.kind !== "produced") return;
    expect(result.artifacts[0]?.kind).toBe("Markdown");
    expect(result.artifacts[0]?.content).toContain("my spec");
  });

  it("returns error for an unknown kind", async () => {
    const runners = createStepRunnerRegistry();
    const deps = makeStubDeps();
    const debugStep = makeDebugStep({ ...deps, runners });

    const result = await debugStep(buildInput({ kind: "nope.unknown" }, []));
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/Unknown step kind/);
  });

  it("returns error when the runner throws", async () => {
    const throwingRunner: StepRunner = {
      kind: "throwing.kind",
      resolveSpec: () => ({ title: "Throwing", inputs: [], outputs: [] }),
      async run() {
        throw new Error("boom");
      },
    };
    const runners = createStepRunnerRegistry();
    runners.register(throwingRunner);
    const deps = makeStubDeps();
    const debugStep = makeDebugStep({ ...deps, runners });

    const result = await debugStep(buildInput({ kind: "throwing.kind" }, []));
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toBe("boom");
  });

  it("forwards awaiting-human outcome from human.gate", async () => {
    const runners = createStepRunnerRegistry();
    runners.register(createHumanGateRunner());
    const deps = makeStubDeps();
    const debugStep = makeDebugStep({ ...deps, runners });

    const result = await debugStep(
      buildInput(
        {
          kind: "human.gate",
          config: {
            role: "Developer",
            prompt: "Validate?",
            inputKind: "Markdown",
          },
          humanGateRequired: true,
        },
        [{ port: "artifact", kind: "Markdown", content: "hi" }],
      ),
    );
    expect(result.kind).toBe("awaiting-human");
    if (result.kind !== "awaiting-human") return;
    expect(result.actorRole).toBe("Developer");
  });
});
