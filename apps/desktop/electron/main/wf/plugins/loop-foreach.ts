/**
 * Runner du step kind "loop.foreach".
 *
 * Ouvre un scope d'itération sur un input array. Le runner lui-même ne
 * matérialise pas les N itérations — il valide la forme du tableau d'entrée
 * et le réémet comme un artifact "liste" pour que l'event-sourcing reste
 * rejouable. C'est l'orchestrateur qui, en aval, lit cette liste et émet N
 * `IterationStarted` (cf. `instance-orchestrator.ts`).
 *
 * Polymorphisme — `config.itemKind` accepte **n'importe quel `ArtifactKind`**
 * (défaut `"Markdown"`) :
 *   - `"Markdown"` / `"Path"` → forme historique : le port `items` accepte le
 *     `MarkdownList` / `PathList` legacy et la liste réémise garde le payload
 *     `{ bodies }` / `{ paths }`.
 *   - tout autre kind `T` → forme canonique : le port `items` accepte
 *     `List<T>` et la liste réémise porte le payload canonique
 *     `{ items: ElementPayload[] }`. Permet d'itérer sur un `List<Json>`
 *     produit par `json.transform`, un `List<user:…>`, etc.
 *
 * Si l'utilisateur câble une source statique via `config.items` (string[]),
 * le runner la prend en charge en mode hardcodé (chaque string est sérialisée
 * vers le payload de `itemKind`). Sinon il lit l'input wiré sur le port
 * `items`.
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
import { canonicalisedFromLegacyList } from "../../../../shared/wf/artifact-kind-grammar";
import { putArtifactPayload } from "../application/artifact-io";
import { serializeFromString } from "../domain/artifact-serializer";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";

const DEFAULT_ITEM_KIND: ArtifactKind = "Markdown";

/** Canonicalise a kind so the legacy `MarkdownList`/`PathList` spellings and
 * their `List<…>` form compare equal. */
const canonicalise = (kind: string): string =>
  canonicalisedFromLegacyList(kind) ?? kind;

/** `true` when `kind` is any kind the registry can resolve — built-in,
 * dynamic (`user:`/`plugin:`) or parametric (`List<…>`, `OneOf<…>`, …). Used
 * to reject a typo'd `itemKind` early without a registry handle. */
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
      `loop.foreach: invalid \`itemKind\` "${String(raw)}" (expected a known artifact kind)`,
    );
  }
  return raw as ArtifactKind;
};

/** `true` for the two legacy item kinds whose list carries an ad-hoc
 * `{ bodies }` / `{ paths }` payload instead of the canonical `{ items }`. */
const isLegacyItemKind = (kind: ArtifactKind): kind is "Markdown" | "Path" =>
  kind === "Markdown" || kind === "Path";

export const listKindFor = (itemKind: ArtifactKind): ArtifactKind => {
  if (itemKind === "Path") return "PathList";
  if (itemKind === "Markdown") return "MarkdownList";
  return `List<${itemKind}>`;
};

const readStaticItems = (
  config: Readonly<Record<string, unknown>>,
): string[] | null => {
  const raw = config["items"];
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    throw new Error(
      "loop.foreach: `config.items` must be an array of strings when set",
    );
  }
  return raw.map((v, i) => {
    if (typeof v !== "string") {
      throw new Error(
        `loop.foreach: \`config.items[${i}]\` must be a string (got ${typeof v})`,
      );
    }
    return v;
  });
};

/** Reads the N strings of a legacy `MarkdownList` / `PathList` input. */
const legacyInputAsList = (
  itemKind: "Markdown" | "Path",
  raw: ArtifactPayload<"PathList" | "MarkdownList"> | null,
  fallbackContent: string,
): string[] => {
  if (raw && typeof raw === "object") {
    if (itemKind === "Path" && "paths" in raw && Array.isArray(raw.paths)) {
      return [...raw.paths];
    }
    if (
      itemKind === "Markdown" &&
      "bodies" in raw &&
      Array.isArray(raw.bodies)
    ) {
      return [...raw.bodies];
    }
  }
  try {
    const parsed = JSON.parse(fallbackContent) as Record<string, unknown>;
    if (itemKind === "Path" && Array.isArray(parsed.paths)) {
      return parsed.paths.map((p) => String(p));
    }
    if (itemKind === "Markdown" && Array.isArray(parsed.bodies)) {
      return parsed.bodies.map((b) => String(b));
    }
  } catch {
    // fall through
  }
  throw new Error(
    `loop.foreach: input array could not be parsed for itemKind=${itemKind}`,
  );
};

/** Reads the N element payloads of a canonical `List<T>` input. */
const canonicalInputAsItems = (
  raw: { items?: unknown } | null,
  fallbackContent: string,
): unknown[] => {
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
    return [...raw.items];
  }
  try {
    const parsed = JSON.parse(fallbackContent) as { items?: unknown };
    if (Array.isArray(parsed.items)) return [...parsed.items];
  } catch {
    // fall through
  }
  throw new Error(
    "loop.foreach: input List<T> could not be parsed (expected `{ items: [...] }`)",
  );
};

export const createLoopForeachRunner = (): StepRunner => ({
  kind: "loop.foreach",

  resolveSpec({ config }): NodeSpec {
    const itemKind = readItemKind(config);
    const listKind = listKindFor(itemKind);
    return {
      title: "For each",
      description:
        "Iterate over an array, fanning out the downstream sub-graph until the matching loop.collect.",
      inputs: [
        { name: "items", kinds: [listKind], primary: true, optional: true },
      ],
      // Declared as the per-iteration item kind — what downstream consumers
      // see and wire to. The orchestrator stores the full list artifact under
      // this slot for replay (kind mismatch is suppressed for `loop.foreach`)
      // and materializes per-iteration unit artifacts via `IterationStarted`.
      outputs: [{ name: "item", kind: itemKind, primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const itemKind = readItemKind(ctx.step.config);
    const listKind = listKindFor(itemKind);
    const staticItems = readStaticItems(ctx.step.config);

    const input = staticItems
      ? null
      : ctx.inputs.find((i) => i.port === "items");
    if (!staticItems && !input) {
      throw new Error(
        "loop.foreach: no `items` input wired and no `config.items` provided",
      );
    }
    if (input && canonicalise(input.kind) !== canonicalise(listKind)) {
      throw new Error(
        `loop.foreach: expected input kind ${listKind} on port "items" (got ${input.kind})`,
      );
    }

    if (isLegacyItemKind(itemKind)) {
      const items: string[] = staticItems
        ? staticItems
        : legacyInputAsList(
            itemKind,
            // input is guaranteed non-null here (staticItems is null).
            input!.payload as ArtifactPayload<"PathList" | "MarkdownList"> | null,
            input!.content,
          );
      const payload =
        itemKind === "Path"
          ? ({ format: "path-list", paths: items } satisfies ArtifactPayload<"PathList">)
          : ({
              format: "markdown-list",
              bodies: items,
            } satisfies ArtifactPayload<"MarkdownList">);
      const artifact = await putArtifactPayload(
        ctx.deps.artifactStore,
        listKind,
        payload as ArtifactPayload<"PathList"> | ArtifactPayload<"MarkdownList">,
        { source: "loop.foreach", itemKind, count: String(items.length) },
      );
      return { kind: "produced", artifact };
    }

    // Generic `List<T>` path: each element is a full `T` payload.
    const elements: unknown[] = staticItems
      ? staticItems.map((s) => serializeFromString(itemKind, s))
      : canonicalInputAsItems(
          input!.payload as { items?: unknown } | null,
          input!.content,
        );
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      listKind,
      { items: elements },
      { source: "loop.foreach", itemKind, count: String(elements.length) },
    );
    return { kind: "produced", artifact };
  },
});
