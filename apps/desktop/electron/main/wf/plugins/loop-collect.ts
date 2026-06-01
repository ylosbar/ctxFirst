/**
 * Runner du step kind "loop.collect".
 *
 * Ferme le scope ouvert par un `loop.foreach`. L'orchestrateur ne déclenche
 * ce runner qu'une fois que les N itérations ont validé leur step amont — il
 * lui passe les N artifacts dans l'ordre du tableau, et le runner les empile
 * dans un artifact de type liste.
 *
 * Polymorphisme symétrique à `loop.foreach` : `config.itemKind` accepte
 * n'importe quel `ArtifactKind` (défaut `"Markdown"`).
 *   - `"Markdown"` / `"Path"` → forme historique `{ bodies }` / `{ paths }`
 *     sur `MarkdownList` / `PathList`.
 *   - tout autre kind `T` → forme canonique `{ items: ElementPayload[] }` sur
 *     `List<T>`.
 */
import type { ArtifactKind } from "../domain/artifact";
import {
  isBuiltinArtifactKind,
  isContainerArtifactKind,
  isContentAddressedArtifactKind,
  isErrorArtifactKind,
  isPluginArtifactKind,
  isSuccessArtifactKind,
  isSumArtifactKind,
  isUserArtifactKind,
} from "../domain/artifact";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";

const DEFAULT_ITEM_KIND: ArtifactKind = "Markdown";

const isKnownKind = (kind: string): boolean =>
  isBuiltinArtifactKind(kind) ||
  isUserArtifactKind(kind) ||
  isPluginArtifactKind(kind) ||
  isContainerArtifactKind(kind) ||
  isSumArtifactKind(kind) ||
  isSuccessArtifactKind(kind) ||
  isErrorArtifactKind(kind) ||
  isContentAddressedArtifactKind(kind);

const readItemKind = (config: Readonly<Record<string, unknown>>): ArtifactKind => {
  const raw = config["itemKind"];
  if (raw === undefined) return DEFAULT_ITEM_KIND;
  if (typeof raw !== "string" || !isKnownKind(raw)) {
    throw new Error(
      `loop.collect: invalid \`itemKind\` "${String(raw)}" (expected a known artifact kind)`,
    );
  }
  return raw as ArtifactKind;
};

const isLegacyItemKind = (kind: ArtifactKind): kind is "Markdown" | "Path" =>
  kind === "Markdown" || kind === "Path";

const listKindFor = (itemKind: ArtifactKind): ArtifactKind => {
  if (itemKind === "Path") return "PathList";
  if (itemKind === "Markdown") return "MarkdownList";
  return `List<${itemKind}>`;
};

/** Extracts the scalar string of a legacy `Markdown` / `Path` item. */
const legacyBodyFromInput = (
  itemKind: "Markdown" | "Path",
  payload: unknown,
  content: string,
): string => {
  if (payload && typeof payload === "object") {
    if (itemKind === "Markdown" && "body" in payload) {
      const b = (payload as { body?: unknown }).body;
      if (typeof b === "string") return b;
    }
    if (itemKind === "Path" && "path" in payload) {
      const p = (payload as { path?: unknown }).path;
      if (typeof p === "string") return p;
    }
  }
  return content;
};

export const createLoopCollectRunner = (): StepRunner => ({
  kind: "loop.collect",

  resolveSpec({ config }): NodeSpec {
    const itemKind = readItemKind(config);
    const listKind = listKindFor(itemKind);
    return {
      title: "Collect",
      description:
        "Aggregates the N per-iteration outputs of a loop.foreach scope into a list artifact.",
      inputs: [
        {
          name: "item",
          kinds: [itemKind],
          isList: true,
          primary: true,
        },
      ],
      outputs: [{ name: "items", kind: listKind, primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const itemKind = readItemKind(ctx.step.config);
    const listKind = listKindFor(itemKind);
    const items = ctx.inputs.filter((i) => i.port === "item");

    if (isLegacyItemKind(itemKind)) {
      const values = items.map((input) =>
        legacyBodyFromInput(itemKind, input.payload, input.content),
      );
      const payload =
        itemKind === "Path"
          ? ({ format: "path-list", paths: values } satisfies ArtifactPayload<"PathList">)
          : ({
              format: "markdown-list",
              bodies: values,
            } satisfies ArtifactPayload<"MarkdownList">);
      const artifact = await putArtifactPayload(
        ctx.deps.artifactStore,
        listKind,
        payload as ArtifactPayload<"PathList"> | ArtifactPayload<"MarkdownList">,
        { source: "loop.collect", itemKind, count: String(values.length) },
      );
      return { kind: "produced", artifact };
    }

    // Generic `List<T>`: stack each item's full `T` payload under `items`.
    const elements: unknown[] = items.map((input) => {
      if (input.payload != null) return input.payload;
      try {
        return JSON.parse(input.content) as unknown;
      } catch {
        return input.content;
      }
    });
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      listKind,
      { items: elements },
      { source: "loop.collect", itemKind, count: String(elements.length) },
    );
    return { kind: "produced", artifact };
  },
});
