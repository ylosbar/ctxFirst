/**
 * Runner du step kind "markdown.template".
 *
 * Traite une **chaîne inline** (`config.template`) comme un gabarit Markdown :
 * chaque `{{placeholder}}` devient un **port d'entrée optionnel**
 * (`Markdown | Json`) dont la valeur câblée est substituée, et le Markdown
 * résultant est exposé sur le port de sortie `out`.
 *
 * Frère de `concat.markdown` (même famille, sortie `Markdown`) dont il extrait
 * la responsabilité « templating ». Contrairement à `skill.loader` — qui lit
 * son gabarit depuis une skill sauvegardée (async, snapshot injecté) — le
 * gabarit vit ici dans la config : `resolveSpec` est donc pur/sync et le runner
 * n'a **aucune dépendance injectée ni snapshot**. Voir
 * `specs/extract-markdown-template-node.md`.
 *
 * Le nom de port **est** le nom de placeholder (aucun `readsFrom` à appliquer,
 * exactement comme `skill.loader`). Le port de chaînage `in` n'est jamais
 * substitué ; un `{{in}}` littéral le masque (limite assumée).
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

/**
 * Optional control-flow port kept so the node stays chainable (e.g. behind a
 * `workspace.set` passthrough) without consuming a value. Never substituted
 * (see {@link buildValueMap}). A literal `{{in}}` placeholder shadows it —
 * assumed limitation, mirrors `skill.loader`.
 */
const CHAIN_PORT = "in";

const readTemplate = (cfg: Readonly<Record<string, unknown>>): string =>
  typeof cfg["template"] === "string" ? cfg["template"] : "";

const bodyOf = (input: RunContextInput): string => {
  const payload = input.payload;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload as { body?: unknown }).body;
    if (typeof body === "string") return body;
  }
  return input.content;
};

/**
 * Policy for an unwired placeholder. Default `empty` (dropped from the prompt —
 * safest for a parametrized prompt, no literal `{{x}}` leaking to the LLM).
 * `keep` leaves it literal, `error` fails the run. Mirrors `skill.loader`.
 */
const parseOnMissing = (raw: unknown): RenderPolicy["onMissing"] =>
  raw === "keep" || raw === "error" ? raw : "empty";

/**
 * Value map keyed by **port name** — which, by construction, equals the
 * placeholder name. The chaining port is skipped: it carries control-flow, not
 * a value.
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
 * Builds the input port list for a given config: one optional `Markdown|Json`
 * port per placeholder (order of appearance, deduped), preceded by the `in`
 * chaining port — unless a literal `{{in}}` placeholder shadows it. An empty
 * template (incl. the catalogue call with `config = {}`) degrades to the
 * permissive `in`-only signature, keeping the node pickable in the editor.
 */
const resolveInputs = (
  cfg: Readonly<Record<string, unknown>>,
): ReadonlyArray<PortSpec> => {
  const names = extractPlaceholders(readTemplate(cfg));
  const placeholderPorts: PortSpec[] = names.map((name) => ({
    name,
    kinds: ["Markdown", "Json"],
    optional: true,
  }));
  return names.includes(CHAIN_PORT)
    ? placeholderPorts
    : [{ name: CHAIN_PORT, kinds: ["*"], optional: true }, ...placeholderPorts];
};

export const createMarkdownTemplateRunner = (): StepRunner => ({
  kind: "markdown.template",

  resolveSpec({ config }: ResolveSpecContext): NodeSpec {
    return {
      title: "Markdown Template",
      description:
        "Gabarit Markdown inline dont les {{variables}} sont hydratées depuis les ports d'entrée.",
      inputs: resolveInputs(config),
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const template = readTemplate(ctx.step.config);
    const onMissing = parseOnMissing(ctx.step.config["onMissing"]);
    const { output, missing } = renderTemplate(template, buildValueMap(ctx), {
      onMissing,
    });
    const payload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: output,
    };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "markdown.template",
        missing: missing.join(","),
      },
    );
    return { kind: "produced", artifact };
  },
});
