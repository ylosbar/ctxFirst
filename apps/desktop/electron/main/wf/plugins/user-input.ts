import type { ArtifactKind } from "../domain/artifact";
import { serializeFromString } from "../domain/artifact-serializer";
import { putArtifactPayload } from "../application/artifact-io";
import type { NodeSpec, StepOutcome, StepRunner } from "../application/step-runner";

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["outputKind"];
  if (typeof k !== "string") {
    throw new Error(
      "user.input runner requires `config.outputKind` (which kind to emit)",
    );
  }
  return k as ArtifactKind;
};

export const createUserInputRunner = (): StepRunner => ({
  kind: "user.input",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "User Input",
      description: "Entry point: captures the seed provided by the user.",
      inputs: [],
      outputs: [{ kind: outputKind, name: "out" }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const input = ctx.inputs[0];
    if (!input) {
      throw new Error("user.input runner requires an input (the pasted spec)");
    }
    const outputKind = readOutputKind(ctx.step.config);
    const payload = serializeFromString(outputKind, input.content);
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      outputKind,
      payload,
      { sourceKind: input.kind },
    );
    return { kind: "produced", artifact };
  },
});
