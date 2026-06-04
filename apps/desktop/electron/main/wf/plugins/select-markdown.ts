/**
 * Runner du step kind "select.markdown".
 *
 * Injection conditionnelle d'un fragment Markdown. Lit un scalaire booléen via
 * JSONPath (`config.path`) dans l'entrée `cond` ; émet sur l'unique port `out`
 * le body de l'entrée `value` si le flag est vrai, sinon du Markdown vide.
 *
 * TOUJOURS `produced` (jamais de port mort) : aucun fan-in à reconverger en
 * aval, contrairement à un diamant `branch.json`. Déterministe, sans LLM.
 *
 * Truthiness (mirror de `branch-json.ts`, mais retourne un booléen) :
 *  - `true` / `"true"`                     → vrai
 *  - `false` / `"false"` / `null`          → faux
 *  - number `0` → faux ; tout autre number → vrai
 *  - string `""` → faux ; toute autre ≠ "false" → vrai
 *  - objet / tableau                       → StepFailed (non-scalaire)
 *  - `path` matche 0 ou >1 valeurs         → StepFailed (exige exactement 1)
 *
 * Coût eager : l'amont qui produit `value` s'exécute toujours, même flag faux
 * (contrairement au diamant `branch.json` qui skippait la branche). Pour une
 * `value` coûteuse (réseau, LLM), préférer un vrai `branch.json`.
 */
import { JSONPath } from "jsonpath-plus";
import { putArtifactPayload } from "../application/artifact-io";
import { serializeFromString } from "../domain/artifact-serializer";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  NodeSpec,
  RunContextInput,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

/**
 * Strips a leading Markdown code fence (```` ``` ````) around the payload —
 * `shell.exec` wraps its stdout that way, so a JSON-emitting script piped
 * through it arrives fenced. Identique au `stripCodeFence` de `branch.json`.
 */
const FENCE_RE = /`{3,}[^\n]*\n([\s\S]*?)\n`{3,}/;
const stripCodeFence = (raw: string): string => {
  const m = FENCE_RE.exec(raw);
  return m ? m[1] : raw;
};

/**
 * Reads `config.path` as a non-empty JSONPath string. Throws (caught by the
 * orchestrator → `StepFailed`) on malformed input — strict over loose, comme
 * `branch.json`.
 */
const readPath = (config: Readonly<Record<string, unknown>>): string => {
  const raw = config["path"];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "select.markdown requires `config.path: string` (a non-empty JSONPath into the `cond` JSON)",
    );
  }
  return raw;
};

/**
 * Coerces a single JSONPath match into a boolean. Scalars only: an
 * object/array can't be a flag, so we force the author to point `path` at a
 * scalar (StepFailed otherwise, comme `branch.json.coerceVerdict`).
 */
const coerceTruthy = (value: unknown, path: string): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null) return false;
  if (typeof value === "string") return value !== "" && value !== "false";
  throw new Error(`select.markdown: path "${path}" matched a non-scalar value`);
};

const bodyOf = (input: RunContextInput): string => {
  const payload = input.payload;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload as { body?: unknown }).body;
    if (typeof body === "string") return body;
  }
  return input.content;
};

export const createSelectMarkdownRunner = (): StepRunner => ({
  kind: "select.markdown",

  resolveSpec({ config }): NodeSpec {
    readPath(config);
    return {
      title: "Select (Markdown)",
      description:
        "Injecte le fragment `value` si le flag JSONPath de `cond` est vrai, sinon du Markdown vide. Toujours produit (pas de branchement) — remplace un diamant branch.json d'injection conditionnelle. La sortie est toujours du Markdown.",
      inputs: [
        { name: "cond", kinds: ["*"], primary: true },
        { name: "value", kinds: ["Markdown", "Json"], optional: true },
      ],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const path = readPath(ctx.step.config);

    const cond = ctx.inputs.find((i) => i.port === "cond") ?? ctx.inputs[0];
    if (!cond) {
      throw new Error("select.markdown: missing artifact on input port `cond`");
    }

    let data: unknown;
    try {
      data = JSON.parse(stripCodeFence(bodyOf(cond)));
    } catch (err) {
      throw new Error(
        `select.markdown: cond input is not valid JSON (${(err as Error).message})`,
      );
    }

    // jsonpath-plus throw sur expression invalide → l'orchestrateur la tourne
    // en StepFailed. Ne jamais passer `sandbox: false`.
    const matches = JSONPath<unknown[]>({
      path,
      json: data as object,
      wrap: true,
    });
    if (matches.length !== 1) {
      throw new Error(
        `select.markdown: path "${path}" matched ${matches.length} values (expected exactly 1)`,
      );
    }
    const truthy = coerceTruthy(matches[0], path);

    const value = ctx.inputs.find((i) => i.port === "value");
    const body = truthy && value ? bodyOf(value) : "";

    const payload = serializeFromString("Markdown", body) as ArtifactPayload<"Markdown">;
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "select.markdown",
        condPath: path,
        injected: String(truthy && !!value),
      },
    );
    return { kind: "produced", artifact };
  },
});
