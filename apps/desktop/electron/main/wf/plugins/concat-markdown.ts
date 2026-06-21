/**
 * Runner du step kind "concat.markdown".
 *
 * Concatène jusqu'à 4 artifacts Markdown nommés : `main` (obligatoire) puis
 * `markdown1` / `markdown2` / `markdown3` (optionnels), dans l'ordre déclaré,
 * avec `separator` / `header` / `footer` (globaux) et un enrobage `entries`
 * par port. Responsabilité unique : concaténer. Le templating
 * (`{{placeholder}}`) vit dans le node dédié `markdown.template`.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
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
        "Concatène un Markdown principal (`main`) avec jusqu'à 3 fragments additionnels optionnels (Markdown ou JSON, ex. exemple inséré dans un prompt). La sortie reste du Markdown.",
      inputs: [
        { name: "main", kinds: ["Markdown", "Json"], primary: true },
        { name: "markdown1", kinds: ["Markdown", "Json"], optional: true },
        { name: "markdown2", kinds: ["Markdown", "Json"], optional: true },
        { name: "markdown3", kinds: ["Markdown", "Json"], optional: true },
      ],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const separator = readStr(cfg["separator"], "\n\n");
    const header = readStr(cfg["header"], "");
    const footer = readStr(cfg["footer"], "");

    const order = readStr(cfg["order"], "top-to-bottom");
    const parts: string[] = [];
    for (const port of SLOT_PORTS) {
      const input = ctx.inputs.find((i) => i.port === port);
      // Skip un port sans arête OU câblé mais au body vide : un fragment vide
      // (ex. `select.markdown` flag faux) ne doit émettre ni contenu ni
      // header/footer, sinon le wrapper produit des balises vides
      // (`<design_system></design_system>`) dans le prompt.
      if (!input) continue;
      const body = bodyOf(input);
      if (body.length === 0) continue;
      const eh = readEntryWrapper(cfg, port, "header");
      const ef = readEntryWrapper(cfg, port, "footer");
      parts.push(wrapPart(body, eh, ef, separator));
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
