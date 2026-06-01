/**
 * Runner du step kind "branch.match".
 *
 * Consomme un artifact de kind `OneOf<A,B,…>` et émet le payload interne sur
 * l'un des N ports de sortie, sélectionné par le discriminator `variantKind`.
 * Chaque port de sortie est typé du variant correspondant (le step "déballe"
 * le sum). Les ports non choisis ne sont pas matérialisés ; l'orchestrateur
 * skip-propage les steps en aval atteints uniquement par ces ports
 * (semantique `produced-on-port`, identique à `branch.bool`).
 *
 * Configuration : `config.targetKind: SumArtifactKind` — la chaîne `OneOf<…>`
 * dont dérive l'enveloppe d'entrée. Le runner refuse de démarrer si la
 * configuration est absente, mal formée, ou si le variant observé au runtime
 * n'est pas dans la liste déclarée.
 */
import {
  isSumArtifactKind,
  parseSumArtifactKind,
  type ArtifactKind,
  type SumArtifactKind,
} from "../domain/artifact";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

/**
 * Port-name encoding for a variant. The same encoding is used at both
 * `resolveSpec` and `run` time so the orchestrator can route consistently.
 * Variant strings may contain `<`, `>` and `:` (e.g. `plugin:foo:Bar@v1`); the
 * orchestrator and event log accept them verbatim — there is no need to
 * sanitise.
 */
const portNameForVariant = (variant: string): string => `out_${variant}`;

const readTargetKind = (
  config: Readonly<Record<string, unknown>>,
): SumArtifactKind => {
  const raw = config["targetKind"];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "branch.match: missing `config.targetKind` (the `OneOf<…>` kind to dispatch on)",
    );
  }
  if (!isSumArtifactKind(raw)) {
    throw new Error(
      `branch.match: \`targetKind\` ${raw} is not a OneOf<…> kind`,
    );
  }
  return raw;
};

const readVariants = (
  config: Readonly<Record<string, unknown>>,
): { target: SumArtifactKind; variants: ArtifactKind[] } => {
  const target = readTargetKind(config);
  const variants = parseSumArtifactKind(target);
  if (!variants) {
    throw new Error(
      `branch.match: \`targetKind\` ${target} is not a well-formed OneOf<…> encoding`,
    );
  }
  return { target, variants };
};

export const createBranchMatchRunner = (): StepRunner => ({
  kind: "branch.match",

  resolveSpec({ config }): NodeSpec {
    const { target, variants } = readVariants(config);
    return {
      title: "Branch (match)",
      description:
        "Dispatches a sum-typed artifact onto one of N outputs based on its `variantKind` discriminator.",
      inputs: [
        {
          name: "in",
          kinds: [target],
          primary: true,
        },
      ],
      outputs: variants.map((v) => ({
        name: portNameForVariant(v),
        kind: v,
        description: `Selected when the input variant is ${v}.`,
      })),
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const { variants } = readVariants(ctx.step.config);
    const input = ctx.inputs[0];
    if (!input) {
      throw new Error("branch.match: missing artifact on input port `in`");
    }
    const payload = input.payload;
    if (!payload || typeof payload !== "object") {
      throw new Error(
        "branch.match: input payload unavailable or non-object (validation mode must not be `off` upstream)",
      );
    }
    const variantKind = (payload as { variantKind?: unknown }).variantKind;
    const inner = (payload as { payload?: unknown }).payload;
    if (typeof variantKind !== "string") {
      throw new Error(
        "branch.match: input payload missing string `variantKind` discriminator",
      );
    }
    if (!variants.includes(variantKind as ArtifactKind)) {
      throw new Error(
        `branch.match: observed variant ${variantKind} not in declared variants (${variants.join("|")})`,
      );
    }

    // Materialise the inner payload as a fresh artifact of the variant kind:
    // downstream steps expect to consume `A` (not `OneOf<A,B>`) on the
    // chosen branch. We write through `putArtifactPayload` so the new
    // artifact carries `payloadFormat: json-v1` and gets validated by the
    // store against the variant's descriptor (registry lookup).
    const variantArtifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      variantKind as ArtifactKind,
      inner as never,
    );

    return {
      kind: "produced-on-port",
      port: portNameForVariant(variantKind),
      artifact: variantArtifact,
    };
  },
});
