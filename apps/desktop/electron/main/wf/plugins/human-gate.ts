import type { ArtifactKind } from "../domain/artifact";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

const readInputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["inputKind"];
  if (typeof k !== "string") {
    throw new Error(
      "human.gate runner requires `config.inputKind` (which kind it pauses on)",
    );
  }
  return k as ArtifactKind;
};

export const createHumanGateRunner = (): StepRunner => ({
  kind: "human.gate",

  resolveSpec({ config }): NodeSpec {
    const inputKind = readInputKind(config);
    return {
      title: "Human Gate",
      description: "Pauses the workflow until a human validates the upstream artifact.",
      inputs: [{ name: "artifact", kinds: [inputKind] }],
      // No artifact of its own: once validated, downstream steps resolve their
      // input from the gated upstream artifact (passthrough / previousDataStepId).
      outputs: [],
      passthrough: true,
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const role = (ctx.step.config["role"] as string | undefined) ?? "Developer";
    return { kind: "awaiting-human", actorRole: role };
  },
});
