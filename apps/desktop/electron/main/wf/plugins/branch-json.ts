/**
 * Runner du step kind "branch.json".
 *
 * Route le workflow vers l'une de N branches en lisant un **champ JSON** de
 * l'artifact d'entrée. Le runner parse le payload en JSON, évalue un JSONPath
 * (`config.path`), coerce la valeur extraite en string, et émet **un seul** des
 * N ports de sortie — celui dont le label (`config.cases`) matche cette valeur.
 *
 * Déterministe, aucune dépendance LLM / réseau : la décision est lue depuis
 * l'artefact déjà persisté. Comble le trou entre `branch.bool` (qui exige un
 * verdict Markdown) et `json.transform` (qui ré-émet toujours un Json
 * array-wrappé) — cf. spec `branch.json`.
 *
 * Comme `branch.bool`, l'artifact d'entrée est ré-émis tel-quel sur le port
 * choisi (pas de nouvelle ressource écrite). Les autres ports ne sont jamais
 * matérialisés ; l'orchestrateur skippe en cascade les steps en aval qui ne
 * sont accessibles que par un port non produit (`propagateSkip`).
 */
import { JSONPath } from "jsonpath-plus";
import type { ArtifactKind } from "../domain/artifact";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

const CASE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Strips a leading Markdown code fence (```` ``` ````) around the payload —
 * `shell.exec` wraps its stdout that way, so a JSON-emitting script piped
 * through it arrives fenced. Identique au `stripCodeFence` de `json.transform`.
 */
const FENCE_RE = /`{3,}[^\n]*\n([\s\S]*?)\n`{3,}/;
const stripCodeFence = (raw: string): string => {
  const m = FENCE_RE.exec(raw);
  return m ? m[1] : raw;
};

/**
 * Reads `config.path` as a non-empty JSONPath string. Throws (caught by the
 * orchestrator → `StepFailed`) on malformed input — strict over loose, like
 * the rest of the engine.
 */
const readPath = (config: Readonly<Record<string, unknown>>): string => {
  const raw = config["path"];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "branch.json requires `config.path: string` (a non-empty JSONPath into the input JSON)",
    );
  }
  return raw;
};

/**
 * Reads `config.cases` and validates it as a list of ≥2 unique, port-name-safe
 * labels. Mirrors `branch.bool.readCases` — same constraint since each case
 * becomes an output port name.
 */
const readCases = (
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> => {
  const raw = config["cases"];
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(
      "branch.json requires `config.cases: string[]` with at least 2 entries (the labels of the output ports)",
    );
  }
  const cases: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (typeof c !== "string" || c.length === 0) {
      throw new Error("branch.json: every case must be a non-empty string");
    }
    if (seen.has(c)) throw new Error(`branch.json: duplicate case "${c}"`);
    if (!CASE_NAME_RE.test(c)) {
      throw new Error(
        `branch.json: case "${c}" must match ${CASE_NAME_RE} (used as a port name)`,
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
  return "Json";
};

/**
 * Coerces a single JSONPath match into the verdict string compared against
 * `cases`. Scalars only: an object/array can't name a port, so we force the
 * author to point `path` at a scalar.
 */
const coerceVerdict = (value: unknown, path: string): string => {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") return value;
  if (value === null) return "null";
  throw new Error(
    `branch.json: path "${path}" matched a non-scalar value`,
  );
};

export const createBranchJsonRunner = (): StepRunner => ({
  kind: "branch.json",

  resolveSpec({ config }): NodeSpec {
    readPath(config);
    const cases = readCases(config);
    const passthroughKind = readPassthroughKind(config);
    const path = config["path"];
    return {
      title: "Branch (JSON)",
      description:
        "Routes the workflow to one of N branches based on a JSON field read from the input artifact.",
      inputs: [{ name: "json", kinds: ["*"], primary: true }],
      outputs: cases.map((c) => ({
        name: c,
        kind: passthroughKind,
        description: `Branch when ${String(path)} equals "${c}".`,
      })),
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const path = readPath(ctx.step.config);
    const cases = readCases(ctx.step.config);

    const input = ctx.inputs.find((i) => i.port === "json") ?? ctx.inputs[0];
    if (!input) {
      throw new Error("branch.json: missing artifact on input port `json`");
    }

    // Si l'entrée est un kind enveloppe (`Json`, `Markdown`…) son `payload.body`
    // porte la chaîne brute à parser. Pour les kinds structurés, `content` est
    // la sérialisation JSON du payload — c'est ce qu'on parse alors. Identique
    // à `json.transform`.
    let raw: string;
    const payload = input.payload as { body?: unknown } | null;
    if (payload && typeof payload.body === "string") {
      raw = payload.body;
    } else {
      raw = input.content;
    }

    let data: unknown;
    try {
      data = JSON.parse(stripCodeFence(raw));
    } catch (err) {
      throw new Error(
        `branch.json: input is not valid JSON (${(err as Error).message})`,
      );
    }

    // jsonpath-plus throw sur expression invalide → l'orchestrateur la tourne
    // en StepFailed avec le message brut. Pas besoin de pré-valider.
    const matches = JSONPath<unknown[]>({
      path,
      json: data as object,
      wrap: true,
    });

    if (matches.length === 0) {
      throw new Error(`branch.json: path "${path}" matched nothing`);
    }
    if (matches.length > 1) {
      throw new Error(
        `branch.json: path "${path}" matched ${matches.length} values (expected exactly 1)`,
      );
    }

    const verdict = coerceVerdict(matches[0], path);

    const chosen = cases.find((c) => c === verdict);
    if (!chosen) {
      throw new Error(
        `branch.json: value "${verdict}" does not match any case (${cases.join("|")})`,
      );
    }

    // Re-emit the input artifact unchanged on the chosen port — content is
    // already in the store; loading its meta gives back a full `Artifact`.
    const { meta } = await ctx.deps.artifactStore.get(input.artifactId);

    return {
      kind: "produced-on-port",
      port: chosen,
      artifact: meta,
    };
  },
});
