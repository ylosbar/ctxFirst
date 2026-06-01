// Spec runs-unified-resizable-workspace.md §6.2 — arbre de split déclaratif du
// Run Workspace. Les zones embarquent les composants de rendu existants
// (§6.4) ; ce module ne décrit que la *disposition* (orientation, tailles,
// repli), pas le contenu. Rendu récursif par RunWorkspaceSplit.tsx, persistance
// des tailles via `useDefaultLayout` de react-resizable-panels (§6.3).

export type ZoneId =
  | "timeline"
  | "graph"
  | "iterations"
  | "artifact"
  | "stats";

// Un nœud de l'arbre : soit une feuille (zone unique ou onglets), soit une
// subdivision (split) contenant des panneaux. Seuls les panneaux portent une
// taille / un repli — un split est un simple conteneur orienté.
export type PaneNode =
  | { readonly type: "zone"; readonly zone: ZoneId }
  | { readonly type: "tabs"; readonly zones: ReadonlyArray<ZoneId> }
  | {
      readonly type: "split";
      readonly id: string;
      readonly orientation: "horizontal" | "vertical";
      readonly panels: ReadonlyArray<PanePanel>;
    };

export type PanePanel = {
  // Identifiant stable du panneau dans son groupe — clé de persistance des
  // tailles (`useDefaultLayout`) et des refs impératives.
  readonly id: string;
  readonly child: PaneNode;
  // Taille par défaut (flexGrow ≈ pourcentage) à la première ouverture et après
  // « Réinitialiser ».
  readonly defaultSize: number;
  // Taille minimale (string px / %) en dehors de l'état replié.
  readonly minSize?: string;
  // Repliable : ajoute un en-tête avec bouton collapse ; figure dans le menu zones.
  readonly collapsible?: boolean;
  // Clé i18n du libellé du panneau (en-tête + entrée du menu zones).
  readonly titleKey: string;
};

// Hauteur de l'en-tête d'une zone repliée (string px passée à `collapsedSize`).
export const COLLAPSED_SIZE = "34px";

// Disposition par défaut (§3) : 2 colonnes (centre | droite). Le listing des
// runs n'est PAS embarqué ici — il reste la vue gauche `runs.list` du workbench
// (cf. contributions.ts), qui pilote l'ouverture de ce workspace. La colonne
// centre porte les onglets timeline/graph/stats ; la colonne droite regroupe
// itérations et artifact dans un même panneau à onglets.
export const DEFAULT_LAYOUT: PaneNode = {
  type: "split",
  id: "root",
  orientation: "horizontal",
  panels: [
    {
      id: "col-center",
      defaultSize: 60,
      minSize: "260px",
      collapsible: true,
      titleKey: "runs.workspace.zone.timelineGraph",
      child: { type: "tabs", zones: ["timeline", "graph", "stats"] },
    },
    {
      id: "col-right",
      defaultSize: 40,
      minSize: "220px",
      collapsible: true,
      titleKey: "runs.workspace.zone.iterations",
      child: { type: "tabs", zones: ["iterations", "artifact"] },
    },
  ],
};

export type CollapsiblePanel = {
  readonly panelId: string;
  readonly titleKey: string;
};

// Liste à plat des panneaux repliables, dans l'ordre de l'arbre — alimente le
// menu zones (§5.2) et la réinitialisation.
export const collapsiblePanels = (
  node: PaneNode = DEFAULT_LAYOUT,
): ReadonlyArray<CollapsiblePanel> => {
  if (node.type !== "split") return [];
  const out: CollapsiblePanel[] = [];
  for (const panel of node.panels) {
    if (panel.collapsible) {
      out.push({ panelId: panel.id, titleKey: panel.titleKey });
    }
    out.push(...collapsiblePanels(panel.child));
  }
  return out;
};

// Layout par défaut (map panelId → taille) de CHAQUE groupe de l'arbre — utilisé
// par « Réinitialiser la disposition » (§5.2) via `GroupImperativeHandle.setLayout`.
export const defaultGroupLayouts = (
  node: PaneNode = DEFAULT_LAYOUT,
): ReadonlyMap<string, Record<string, number>> => {
  const out = new Map<string, Record<string, number>>();
  const walk = (n: PaneNode): void => {
    if (n.type !== "split") return;
    out.set(
      n.id,
      Object.fromEntries(n.panels.map((p) => [p.id, p.defaultSize])),
    );
    for (const p of n.panels) walk(p.child);
  };
  walk(node);
  return out;
};
