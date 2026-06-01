/**
 * Runner du step kind "concat.markdown".
 *
 * Deux modes :
 *  - `"concat"` (défaut, legacy) — concatène jusqu'à 4 artifacts Markdown
 *    nommés : `main` (obligatoire) puis `markdown1` / `markdown2` / `markdown3`
 *    (optionnels), dans l'ordre déclaré, avec `separator` / `header` / `footer`.
 *  - `"template"` — le port `main` devient un **gabarit** ; les placeholders
 *    `{{name}}` sont remplacés par le contenu des autres ports, adressés par
 *    **nom de variable** via `readsFrom` (repli sur le nom de port). Politiques
 *    `onMissing` (placeholder non fourni) et `onUnused` (port câblé non
 *    référencé) configurables.
 */
import {
  renderTemplate,
  type RenderPolicy,
} from "@shared/wf/placeholders";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  RunContext,
  RunContextInput,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";

const VALUE_PORTS = ["markdown1", "markdown2", "markdown3"] as const;
const SLOT_PORTS = ["main", ...VALUE_PORTS] as const;

const readStr = (v: unknown, fallback: string): string =>
  typeof v === "string" ? v : fallback;

const bodyOf = (input: RunContextInput): string => {
  const payload = input.payload;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload).body;
    if (typeof body === "string") return body;
  }
  return input.content;
};

const buildValueMap = (ctx: RunContext): Map<string, string> => {
  const map = new Map<string, string>();
  for (const port of VALUE_PORTS) {
    const input = ctx.inputs.find((i) => i.port === port);
    if (!input) continue;
    const varName = ctx.step.readsFrom?.[port];
    map.set(varName ?? port, bodyOf(input));
  }
  return map;
};

const parseOnMissing = (raw: unknown): RenderPolicy["onMissing"] => {
  if (raw === "empty" || raw === "error") return raw;
  return "keep";
};

const parseOnUnused = (raw: unknown): "append" | "ignore" => {
  return raw === "ignore" ? "ignore" : "append";
};

const readEntryWrapper = (
  cfg: Readonly<Record<string, unknown>>,
  port: string,
  field: "header" | "footer",
): string => {
  const entries = cfg["entries"];
  if (!entries || typeof entries !== "object") return "";
  const e = (entries as Record<string, unknown>)[port];
  if (!e || typeof e !== "object") return "";
  const v = (e as Record<string, unknown>)[field];
  return typeof v === "string" ? v : "";
};

const wrapPart = (
  body: string,
  entryHeader: string,
  entryFooter: string,
  separator: string,
): string => {
  const segs: string[] = [];
  if (entryHeader.length > 0) segs.push(entryHeader);
  segs.push(body);
  if (entryFooter.length > 0) segs.push(entryFooter);
  return segs.join(separator);
};

export const createConcatMarkdownRunner = (): StepRunner => ({
  kind: "concat.markdown",

  resolveSpec(): NodeSpec {
    return {
      title: "Concat Markdown",
      description:
        "Concatène un Markdown principal (`main`) avec jusqu'à 3 Markdown additionnels optionnels — ou, en mode template, utilise `main` comme gabarit dont les `{{name}}` sont substitués.",
      inputs: [
        { name: "main", kinds: ["Markdown"], primary: true },
        { name: "markdown1", kinds: ["Markdown"], optional: true },
        { name: "markdown2", kinds: ["Markdown"], optional: true },
        { name: "markdown3", kinds: ["Markdown"], optional: true },
      ],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const mode = readStr(cfg["mode"], "concat");
    const separator = readStr(cfg["separator"], "\n\n");
    const header = readStr(cfg["header"], "");
    const footer = readStr(cfg["footer"], "");

    if (mode === "template") {
      const tpl = ctx.inputs.find((i) => i.port === "main");
      if (!tpl) {
        throw new Error(
          "concat.markdown[template]: port `main` non câblé (le gabarit est obligatoire)",
        );
      }
      const values = buildValueMap(ctx);
      const onMissing = parseOnMissing(cfg["onMissing"]);
      const { output, missing, unused } = renderTemplate(
        bodyOf(tpl),
        values,
        { onMissing },
      );

      let core = output;
      if (parseOnUnused(cfg["onUnused"]) === "append" && unused.length > 0) {
        const tail = unused.map((k) => values.get(k) ?? "").join(separator);
        core = [core, tail].filter((s) => s.length > 0).join(separator);
      }

      const segments: string[] = [];
      if (header.length > 0) segments.push(header);
      if (core.length > 0) segments.push(core);
      if (footer.length > 0) segments.push(footer);
      const body = segments.join(separator);

      const payload: ArtifactPayload<"Markdown"> = { format: "markdown", body };
      const artifact = await putArtifactPayload(
        ctx.deps.artifactStore,
        "Markdown",
        payload,
        {
          source: "concat.markdown",
          mode: "template",
          missing: missing.join(","),
          unused: unused.join(","),
        },
      );
      return { kind: "produced", artifact };
    }

    const order = readStr(cfg["order"], "top-to-bottom");
    const parts: string[] = [];
    for (const port of SLOT_PORTS) {
      const input = ctx.inputs.find((i) => i.port === port);
      if (!input) continue;
      const eh = readEntryWrapper(cfg, port, "header");
      const ef = readEntryWrapper(cfg, port, "footer");
      parts.push(wrapPart(bodyOf(input), eh, ef, separator));
    }
    if (order === "bottom-to-top") parts.reverse();

    const segments: string[] = [];
    if (header.length > 0) segments.push(header);
    if (parts.length > 0) segments.push(parts.join(separator));
    if (footer.length > 0) segments.push(footer);
    const body = segments.join(separator);

    const payload: ArtifactPayload<"Markdown"> = { format: "markdown", body };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        partCount: String(parts.length),
        source: "concat.markdown",
      },
    );
    return { kind: "produced", artifact };
  },
});
