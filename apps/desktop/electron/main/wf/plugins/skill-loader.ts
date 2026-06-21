/**
 * Runner du step kind "skill.loader".
 *
 * Résout une skill (alias "prompt" côté UI) sauvegardée dans la bibliothèque
 * via `config.skillRef`, **hydrate** ses `{{placeholder}}`, et expose le
 * Markdown substitué sur le port de sortie `out`.
 *
 * Chaque `{{name}}` du corps de la skill devient un **port d'entrée optionnel**
 * (`Markdown | Json`) ; la valeur d'une variable de template y est branchée via
 * `readsFrom` (producteur in-graph ou variable de lancement seedée — les deux
 * convergent sur le même canal). Voir `specs/skill-loader-hydrate-variables.md`.
 *
 * Une skill sans placeholder se comporte comme avant : son `body` brut est
 * émis tel quel (le seul port `in` de chaînage reste disponible).
 */
import {
  extractPlaceholders,
  renderTemplate,
  type RenderPolicy,
} from "@shared/wf/placeholders";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  PortSpec,
  ResolveSpecContext,
  RunContext,
  RunContextInput,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import { asSkillRef } from "../domain/ids";

/**
 * Optional control-flow port kept from the legacy signature: lets the node be
 * chained (e.g. behind a `workspace.set` passthrough) without consuming any
 * value. Never substituted (see {@link buildValueMap}). A literal `{{in}}`
 * placeholder shadows it — assumed limitation (cf. spec § Risques).
 */
const CHAIN_PORT = "in";

export type SkillLoaderRunnerDeps = {
  /**
   * Synchronous snapshot lookup of a saved skill's body by `ref`. `resolveSpec`
   * is pure/sync (the registry is async), so the composition root injects a
   * cached accessor — exact analogue of `workflow.call`'s `getChild`. Returns
   * `undefined` on a cold snapshot or an unknown ref; the runner then degrades
   * to the permissive legacy signature (only the `in` port) rather than
   * throwing, keeping the node pickable in the editor.
   */
  getSkillBody?: (ref: string) => string | undefined;
};

type SkillLoaderConfig = { skillRef: string };

const parseConfig = (
  cfg: Readonly<Record<string, unknown>>,
): SkillLoaderConfig => {
  const skillRef = readSkillRef(cfg);
  if (!skillRef) {
    throw new Error("skill.loader: `skillRef` is required");
  }
  return { skillRef };
};

const readSkillRef = (cfg: Readonly<Record<string, unknown>>): string => {
  const raw = cfg["skillRef"];
  return typeof raw === "string" ? raw.trim() : "";
};

const bodyOf = (input: RunContextInput): string => {
  const payload = input.payload;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload as { body?: unknown }).body;
    if (typeof body === "string") return body;
  }
  return input.content;
};

/**
 * Policy for an unwired placeholder. Default `empty` (the placeholder is
 * dropped from the prompt — safest for a parametrized prompt, no literal
 * `{{x}}` leaking to the LLM). An author may override via `config.onMissing`:
 * `keep` leaves it literal, `error` fails the run. Mirrors `concat.markdown`'s
 * parser; only the default differs (`empty` here, `keep` there).
 */
const parseOnMissing = (raw: unknown): RenderPolicy["onMissing"] => {
  if (raw === "keep" || raw === "error") return raw;
  return "empty";
};

/**
 * Value map keyed by **port name** — which, by construction, equals the
 * placeholder name. `readsFrom` only designates each port's data source; the
 * variable name has no bearing on substitution (unlike `concat.markdown`, whose
 * ports are positional `markdown1..3` and need a `readsFrom` rename). The
 * chaining port is skipped: it carries control-flow, not a value.
 */
const buildValueMap = (ctx: RunContext): Map<string, string> => {
  const map = new Map<string, string>();
  for (const input of ctx.inputs) {
    if (input.port === CHAIN_PORT) continue;
    map.set(input.port, bodyOf(input));
  }
  return map;
};

/**
 * Builds the input port list for a given config. One optional port per
 * placeholder when the body is known; degrades to preserve `readsFrom` bindings
 * on a cold snapshot, or to the permissive `in`-only signature with no ref.
 */
const resolveInputs = (
  config: Readonly<Record<string, unknown>>,
  readsFrom: Readonly<Record<string, string>> | undefined,
  getSkillBody: SkillLoaderRunnerDeps["getSkillBody"],
): ReadonlyArray<PortSpec> => {
  const ref = readSkillRef(config);
  const body = ref ? getSkillBody?.(ref) : undefined;

  let names: string[];
  if (body !== undefined) {
    // Hit: ports are EXACTLY the body's placeholders. A stale `readsFrom`
    // targeting a removed placeholder correctly surfaces as a rule-6 error.
    names = extractPlaceholders(body);
  } else if (ref) {
    // Miss (cold snapshot / unknown ref): don't invalidate existing wires —
    // declare a port per `readsFrom` key so a transient miss can't fail rule 6
    // on a correct binding. `getSkillBody` already kicked off a re-warm.
    names = readsFrom
      ? Object.keys(readsFrom).filter((k) => k !== CHAIN_PORT)
      : [];
  } else {
    // No ref at all (catalogue / unconfigured): permissive signature.
    names = [];
  }

  const placeholderPorts: PortSpec[] = names.map((name) => ({
    name,
    kinds: ["Markdown", "Json"],
    optional: true,
  }));
  // A literal `{{in}}` placeholder shadows the chaining port (assumed limit).
  return names.includes(CHAIN_PORT)
    ? placeholderPorts
    : [{ name: CHAIN_PORT, kinds: ["*"], optional: true }, ...placeholderPorts];
};

export const createSkillLoaderRunner = (
  deps: SkillLoaderRunnerDeps = {},
): StepRunner => ({
  kind: "skill.loader",

  resolveSpec({ config, readsFrom }: ResolveSpecContext): NodeSpec {
    return {
      title: "Skill Loader",
      description:
        "Charge une skill sauvegardée, hydrate ses {{variables}} depuis les ports d'entrée, et expose le Markdown substitué.",
      inputs: resolveInputs(config, readsFrom, deps.getSkillBody),
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const { skillRef } = parseConfig(ctx.step.config);
    if (!ctx.deps.skills) {
      throw new Error(
        "skill.loader: SkillRegistry not wired into ctx.deps.skills",
      );
    }
    // Authoritative body comes from the async registry, not the snapshot —
    // the snapshot only feeds the pure/sync `resolveSpec`.
    const skill = await ctx.deps.skills.resolve(asSkillRef(skillRef));
    const onMissing = parseOnMissing(ctx.step.config["onMissing"]);
    const { output, missing } = renderTemplate(
      skill.body,
      buildValueMap(ctx),
      { onMissing },
    );
    const payload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: output,
    };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "skill.loader",
        skillRef,
        missing: missing.join(","),
        byteLength: String(Buffer.byteLength(output, "utf-8")),
      },
    );
    return { kind: "produced", artifact };
  },
});
