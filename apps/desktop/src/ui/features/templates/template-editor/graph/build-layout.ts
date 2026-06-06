import type { Node } from "@xyflow/react";
import type {
  GroupLayout,
  NodePositionEntry,
  StickyNoteLayout,
  TemplateLayout,
  ViewportState,
} from "@shared/wf/layout";

type BuildLayoutOptions = {
  /** Pan + zoom captured at build time (`rf.getViewport()`). */
  viewport: ViewportState;
  /** ISO-8601 timestamp stamped on the layout. */
  updatedAt: string;
  /** Filters synthetic nodes (start, variables…) out of the persisted layout. */
  isSynthetic: (id: string) => boolean;
};

/**
 * Sérialise l'état canvas (positions + groupes + sticky notes + viewport) en
 * `TemplateLayout`. Builder pur unique partagé par l'auto-save debounced
 * ([useLayoutAutosave]) et le snapshot de 1er save d'un template neuf
 * ([TemplateEditor] `buildLayoutSnapshot`) — auparavant deux implémentations
 * divergentes où le snapshot **omettait les sticky notes**, perdant les
 * post-its d'un nouveau template au 1er save.
 */
export const buildTemplateLayout = (
  nodes: ReadonlyArray<Node>,
  { viewport, updatedAt, isSynthetic }: BuildLayoutOptions,
): TemplateLayout => {
  const positions: Record<string, NodePositionEntry> = {};
  const groups: GroupLayout[] = [];
  const stickyNotes: StickyNoteLayout[] = [];
  for (const n of nodes) {
    if (isSynthetic(n.id)) continue;
    if (n.type === "stickyNote") {
      const data = (n.data ?? {}) as { text?: string; color?: string };
      const w = n.width ?? (n.style?.width as number | undefined) ?? 0;
      const h = n.height ?? (n.style?.height as number | undefined) ?? 0;
      stickyNotes.push({
        id: n.id,
        position: { x: n.position.x, y: n.position.y },
        size: { width: w, height: h },
        text: data.text ?? "",
        ...(data.color ? { color: data.color } : {}),
      });
      continue;
    }
    if (n.type === "group") {
      const data = (n.data ?? {}) as { label?: string };
      const w = n.width ?? (n.style?.width as number | undefined) ?? 0;
      const h = n.height ?? (n.style?.height as number | undefined) ?? 0;
      groups.push({
        id: n.id,
        position: { x: n.position.x, y: n.position.y },
        size: { width: w, height: h },
        label: data.label ?? "",
      });
      continue;
    }
    // Position xyflow : relative au parent si `parentId`, absolue sinon —
    // on persiste tel quel + le `parentId` pour que le loader reconstruise
    // la même topologie sans ré-inférer par containment.
    positions[n.id] = {
      x: n.position.x,
      y: n.position.y,
      ...(n.parentId ? { parentId: n.parentId } : {}),
    };
  }
  return {
    positions,
    ...(groups.length > 0 ? { groups } : {}),
    ...(stickyNotes.length > 0 ? { stickyNotes } : {}),
    viewport,
    updatedAt,
  };
};
