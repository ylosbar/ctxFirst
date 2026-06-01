/**
 * Stable color mapping per {@link ArtifactKind} used to paint React Flow
 * handles in the template editor. Polymorphic ports get a striped gradient;
 * the `"*"` wildcard gets a neutral gray.
 *
 * Palette is hard-coded (not hashed) so the visual identity of a kind stays
 * the same across boots and across users — capture-vs-capture diffs only show
 * structural changes, not random color reshuffles.
 */
import type { ArtifactKind, PortKindMatcher } from "../../../domain/workflow/types";

// Built-in palette entries. Plugin- and user-defined kinds fall through to
// `WILDCARD_COLOR` — the renderer can layer additional entries on top via a
// runtime extension if a plugin wants a specific color.
const PALETTE: Partial<Record<ArtifactKind, string>> = {
  LinearRef: "hsl(20 80% 55%)",
  "plugin:linear:Ticket@v1": "hsl(0 70% 55%)",
  Markdown: "hsl(0 0% 50%)",
  Path: "hsl(195 60% 45%)",
  PathList: "hsl(195 60% 30%)",
  MarkdownList: "hsl(0 0% 35%)",
};

const WILDCARD_COLOR = "hsl(0 0% 75%)";

const colorOf = (k: PortKindMatcher): string =>
  k === "*" ? WILDCARD_COLOR : (PALETTE[k as ArtifactKind] ?? WILDCARD_COLOR);

export const portColor = (kinds: ReadonlyArray<PortKindMatcher>): string => {
  if (kinds.length === 0) return WILDCARD_COLOR;
  if (kinds.includes("*")) return WILDCARD_COLOR;
  if (kinds.length === 1) return colorOf(kinds[0]);
  // Multi-kind gradient: each kind gets an equal slice along the handle.
  const stops = kinds
    .map((k, i) => {
      const from = (i * 100) / kinds.length;
      const to = ((i + 1) * 100) / kinds.length;
      return `${colorOf(k)} ${from}% ${to}%`;
    })
    .join(", ");
  return `linear-gradient(90deg, ${stops})`;
};

/** Human-readable label for a port's accepted kinds — used in tooltips. */
export const portKindsLabel = (
  kinds: ReadonlyArray<PortKindMatcher>,
): string => {
  if (kinds.length === 0) return "—";
  if (kinds.includes("*")) return "any";
  return kinds.join(" | ");
};
