/**
 * Runner du step kind "branch.bool".
 *
 * Route le workflow vers l'une de N branches en fonction d'un verdict
 * Markdown (la valeur lue est `body.trim()`). Le runner déclare N ports de
 * sortie nommés d'après `config.cases: string[]` et émet **un seul** des N
 * — celui dont le label matche la valeur du verdict.
 *
 * L'artifact d'entrée est ré-émis tel-quel sur le port choisi (pas de
 * nouvelle ressource écrite côté store). Les autres ports ne sont jamais
 * matérialisés ; l'orchestrateur skippe en cascade les steps en aval qui ne
 * sont accessibles que par un port non produit (cf. `propagateSkip`).
 */
import type { ArtifactKind } from "../domain/artifact";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

const CASE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Reads `config.cases` and validates it as a non-empty list of unique,
 * port-name-safe labels. Throws (caught by the orchestrator and re-emitted as
 * `StepFailed`) on every malformed input — strict over loose, like the rest
 * of the engine.
 */
const readCases = (
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> => {
  const raw = config["cases"];
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(
      "branch.bool requires `config.cases: string[]` with at least 2 entries (the labels of the output ports)",
    );
  }
  const cases: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (typeof c !== "string" || c.length === 0) {
      throw new Error("branch.bool: every case must be a non-empty string");
    }
    if (seen.has(c)) throw new Error(`branch.bool: duplicate case "${c}"`);
    if (!CASE_NAME_RE.test(c)) {
      throw new Error(
        `branch.bool: case "${c}" must match ${CASE_NAME_RE} (used as a port name)`,
      );
    }
    seen.add(c);
    cases.push(c);
  }
  return cases;
};

const readPassthroughKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const raw = config["inputKind"];
  if (typeof raw === "string" && raw.length > 0) return raw as ArtifactKind;
  return "Markdown";
};

export const createBranchBoolRunner = (): StepRunner => ({
  kind: "branch.bool",

  resolveSpec({ config }): NodeSpec {
    const cases = readCases(config);
    const passthroughKind = readPassthroughKind(config);
    return {
      title: "Branch",
      description:
        "Routes the workflow to one of N branches based on the verdict carried by the input artifact.",
      inputs: [
        {
          name: "verdict",
          kinds: ["Markdown"],
          primary: true,
        },
      ],
      outputs: cases.map((c) => ({
        name: c,
        kind: passthroughKind,
        description: `Branch when verdict equals "${c}".`,
      })),
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cases = readCases(ctx.step.config);
    const input = ctx.inputs[0];
    if (!input) {
      throw new Error("branch.bool: missing artifact on input port `verdict`");
    }

    let verdict: string;
    if (input.kind === "Markdown") {
      const payload = input.payload as ArtifactPayload<"Markdown"> | null;
      if (!payload) {
        throw new Error(
          "branch.bool: Markdown payload unavailable (validation mode must not be `off` upstream)",
        );
      }
      verdict = payload.body.trim();
    } else {
      throw new Error(
        `branch.bool: unsupported verdict kind ${input.kind} (expected Markdown)`,
      );
    }

    const chosen = cases.find((c) => c === verdict);
    if (!chosen) {
      throw new Error(
        `branch.bool: verdict "${verdict}" does not match any declared case (${cases.join("|")})`,
      );
    }

    // Re-emit the input artifact unchanged on the chosen port. Content is
    // already in the store; loading its meta gives us back a full `Artifact`
    // we can pass through to the orchestrator without re-writing bytes.
    const { meta } = await ctx.deps.artifactStore.get(input.artifactId);

    return {
      kind: "produced-on-port",
      port: chosen,
      artifact: meta,
    };
  },
});
