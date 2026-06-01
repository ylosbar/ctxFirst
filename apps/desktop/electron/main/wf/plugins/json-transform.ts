/**
 * Runner du step kind "json.transform".
 *
 * Lit un artifact d'entrée arbitraire (kind wildcard), tente de le parser en
 * JSON, puis évalue N expressions JSONPath. Chaque expression alimente un
 * port de sortie nommé déclaré dans `config.transformations`. Le résultat
 * d'une expression est toujours un tableau (même quand elle ne match
 * qu'un scalaire, ou 0 valeur). Émet un outcome `produced-many` couvrant
 * tous les ports.
 *
 * Échoue si l'entrée n'est pas un JSON valide (pas de fallback string).
 */
import { JSONPath } from "jsonpath-plus";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  ProducedSlot,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";

const PORT_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

type WrapItemKind = "Json" | "Markdown";

type Transformation = {
  port: string;
  expression: string;
  /**
   * When `"list"`, the port emits a list artifact (one element per match)
   * instead of a single `Json` whose body is the matches array. Makes the
   * projection directly consumable by a `loop.foreach`. The element kind is
   * driven by `itemKind`:
   *   - `"Json"` (default) → canonical `List<Json>` (`{ items: [...] }`).
   *   - `"Markdown"` → legacy `MarkdownList` (`{ bodies: [...] }`), each match
   *     rendered as a Markdown body (string as-is, object pretty-printed).
   *     Ready to feed a `concat.markdown` prompt builder.
   */
  wrap?: "list";
  itemKind?: WrapItemKind;
};

const WRAP_ITEM_KINDS: ReadonlyArray<WrapItemKind> = ["Json", "Markdown"];

/** Renders a single JSONPath match into a Markdown body. */
const matchToMarkdown = (m: unknown): string =>
  typeof m === "string" ? m : JSON.stringify(m, null, 2);

/**
 * Strips a leading Markdown code fence (```` ``` ````) around the payload —
 * `shell.exec` wraps its stdout that way, so a JSON-emitting script piped
 * through it arrives fenced. Returns the inner block when a fence is present,
 * the input unchanged otherwise (so already-raw JSON is untouched).
 */
const FENCE_RE = /`{3,}[^\n]*\n([\s\S]*?)\n`{3,}/;
const stripCodeFence = (raw: string): string => {
  const m = FENCE_RE.exec(raw);
  return m ? m[1] : raw;
};

const readTransformations = (
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<Transformation> => {
  const raw = config["transformations"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "json.transform requires `config.transformations: { port, expression }[]` with at least 1 entry",
    );
  }
  const seen = new Set<string>();
  const out: Transformation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new Error("json.transform: each transformation must be an object");
    }
    const { port, expression } = item as Record<string, unknown>;
    if (typeof port !== "string" || port.length === 0) {
      throw new Error("json.transform: port name must be a non-empty string");
    }
    if (!PORT_NAME_RE.test(port)) {
      throw new Error(
        `json.transform: port "${port}" must match ${PORT_NAME_RE}`,
      );
    }
    if (seen.has(port)) {
      throw new Error(`json.transform: duplicate port "${port}"`);
    }
    if (typeof expression !== "string" || expression.length === 0) {
      throw new Error(
        `json.transform: port "${port}" needs a non-empty JSONPath expression`,
      );
    }
    const wrapRaw = (item as Record<string, unknown>)["wrap"];
    if (wrapRaw !== undefined && wrapRaw !== "list") {
      throw new Error(
        `json.transform: port "${port}" \`wrap\` must be "list" when set`,
      );
    }
    const itemKindRaw = (item as Record<string, unknown>)["itemKind"];
    if (
      itemKindRaw !== undefined &&
      (typeof itemKindRaw !== "string" ||
        !WRAP_ITEM_KINDS.includes(itemKindRaw as WrapItemKind))
    ) {
      throw new Error(
        `json.transform: port "${port}" \`itemKind\` must be one of ${WRAP_ITEM_KINDS.join("|")}`,
      );
    }
    seen.add(port);
    out.push({
      port,
      expression,
      wrap: wrapRaw,
      itemKind: itemKindRaw as WrapItemKind | undefined,
    });
  }
  return out;
};

export const createJsonTransformRunner = (): StepRunner => ({
  kind: "json.transform",

  resolveSpec({ config }): NodeSpec {
    const transformations = readTransformations(config);
    return {
      title: "JSON Transform",
      description:
        "Extrait N projections d'un JSON via JSONPath. Chaque slot émet un Json (toujours un tableau de matches).",
      inputs: [{ name: "json", kinds: ["*"], primary: true }],
      outputs: transformations.map((t) => {
        const listKind =
          (t.itemKind ?? "Json") === "Markdown" ? "MarkdownList" : "List<Json>";
        const kind = t.wrap === "list" ? listKind : "Json";
        return {
          name: t.port,
          kind,
          description: `JSONPath: ${t.expression}${t.wrap === "list" ? ` (→ ${kind})` : ""}`,
        };
      }),
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const transformations = readTransformations(ctx.step.config);
    const input =
      ctx.inputs.find((i) => i.port === "json") ?? ctx.inputs[0];
    if (!input) {
      throw new Error("json.transform: missing artifact on input port `json`");
    }

    // Si l'entrée est déjà un kind enveloppe (`Json`, `Markdown`…) son
    // `payload.body` porte la chaîne brute à parser. Pour les kinds structurés
    // (`plugin:*:*@*`, `user:*`), `content` est la sérialisation JSON du
    // payload complet — c'est ce qu'on parse alors.
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
        `json.transform: input is not valid JSON (${(err as Error).message})`,
      );
    }

    const slots: ProducedSlot[] = [];
    for (const t of transformations) {
      // jsonpath-plus throw sur expression invalide → l'orchestrateur la
      // tourne en StepFailed avec le message brut. Pas besoin de pré-valider.
      const matches = JSONPath<unknown[]>({
        path: t.expression,
        json: data as object,
        wrap: true,
      });

      const baseMeta = {
        source: "json.transform",
        port: t.port,
        expression: t.expression,
        srcArtifactId: input.artifactId,
        srcKind: input.kind,
      };

      if (t.wrap === "list") {
        const itemKind = t.itemKind ?? "Json";
        if (itemKind === "Markdown") {
          // Legacy `MarkdownList` — one Markdown body per match, ready to feed
          // a `loop.foreach` (itemKind Markdown) → `concat.markdown` chain.
          const bodies = matches.map(matchToMarkdown);
          const artifact = await putArtifactPayload(
            ctx.deps.artifactStore,
            "MarkdownList",
            { format: "markdown-list", bodies } satisfies ArtifactPayload<"MarkdownList">,
            { ...baseMeta, count: String(bodies.length) },
          );
          slots.push({ port: t.port, artifact });
          continue;
        }
        // Canonical `List<Json>`: one `Json` element per match, ready for a
        // `loop.foreach` with `itemKind: "Json"`.
        const items = matches.map((m) => ({
          format: "json",
          body: JSON.stringify(m),
        }));
        const artifact = await putArtifactPayload(
          ctx.deps.artifactStore,
          "List<Json>",
          { items },
          { ...baseMeta, count: String(items.length) },
        );
        slots.push({ port: t.port, artifact });
        continue;
      }

      const body = JSON.stringify(matches);
      const out: ArtifactPayload<"Json"> = { format: "json", body };
      const artifact = await putArtifactPayload(
        ctx.deps.artifactStore,
        "Json",
        out,
        baseMeta,
      );
      slots.push({ port: t.port, artifact });
    }

    return { kind: "produced-many", artifacts: slots };
  },
});
