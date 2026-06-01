/**
 * Runner du step kind "transform.run".
 *
 * Consomme un artefact d'entrée (sur le port `src`), applique un parser saved
 * (résolu via `config.transformRef`), persiste le résultat comme nouvel
 * artefact typé `config.outputKind`. Aucun LLM, déterministe.
 *
 * Remplace le mécanisme implicite « parser-as-option » (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B) : chaque transformation
 * devient un nœud explicite du graphe, réutilisable par les steps suivants
 * et visible en tant qu'artefact dans l'historique.
 */
import { PAYLOAD_FORMAT_JSON_V1 } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";
import type { ParserRef } from "../domain/parser";

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["outputKind"];
  if (typeof k !== "string" || k.length === 0) {
    throw new Error(
      "transform.run requires `config.outputKind` (kind of the produced artifact)",
    );
  }
  return k as ArtifactKind;
};

const readTransformRef = (
  config: Readonly<Record<string, unknown>>,
): ParserRef => {
  const raw = config["transformRef"];
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "transform.run requires `config.transformRef` ({ id, version }) — pointer to a saved parser",
    );
  }
  const { id, version } = raw as { id?: unknown; version?: unknown };
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof version !== "string" ||
    version.length === 0
  ) {
    throw new Error(
      "transform.run.transformRef requires `id` and `version` strings",
    );
  }
  return { id, version };
};

export const createTransformRunRunner = (): StepRunner => ({
  kind: "transform.run",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "Transform",
      description:
        "Applique un parser saved sur l'artefact d'entrée et produit un nouvel artefact typé. Déterministe, aucune dépendance LLM.",
      inputs: [{ name: "src", kinds: ["*"], primary: true }],
      outputs: [{ kind: outputKind, name: "out" }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const outputKind = readOutputKind(ctx.step.config);
    const ref = readTransformRef(ctx.step.config);

    if (!ctx.deps.parsers || !ctx.deps.parserRuntime) {
      throw new Error(
        "transform.run requires `parsers` and `parserRuntime` in deps (composition-root wiring)",
      );
    }

    const input = ctx.inputs.find((i) => i.port === "src") ?? ctx.inputs[0];
    if (!input) {
      throw new Error(
        "transform.run requires a value on its `src` input port",
      );
    }

    const parser = ctx.deps.parsers.resolve(ref);
    if (!parser) {
      throw new Error(
        `transform.run: parser not found ${ref.id}@${ref.version}`,
      );
    }

    // Best-effort JSON parse: an upstream `plugin:*:*@*` / `user:*` artifact
    // is persisted as JSON ; un Markdown brut ne l'est pas. On retombe alors
    // sur le texte brut pour qu'un parser écrit pour des payloads textuels
    // puisse toujours l'inspecter.
    let raw: unknown;
    try {
      raw = JSON.parse(input.content);
    } catch {
      raw = input.content;
    }

    const transformed = await ctx.deps.parserRuntime.run(parser, raw);

    // Pilier A : la validation du payload contre `outputKind` est faite par
    // l'`ArtifactStore` au moment du `put`. Un transformer qui produit un
    // payload non conforme throw `ArtifactSchemaError`, que l'orchestrateur
    // tourne en `StepFailed { reason: "invalid-output" }`.
    const artifact = await ctx.deps.artifactStore.put(
      outputKind,
      JSON.stringify(transformed),
      {
        payloadFormat: PAYLOAD_FORMAT_JSON_V1,
        source: "transform.run",
        transformerId: parser.id,
        transformerVersion: parser.version,
        srcArtifactId: input.artifactId,
        srcKind: input.kind,
      },
    );
    return { kind: "produced", artifact };
  },
});
