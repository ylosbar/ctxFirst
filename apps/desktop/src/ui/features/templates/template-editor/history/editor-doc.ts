/**
 * Le **document** annulable de l'éditeur de templates : les quatre atomes
 * d'état éditables possédés par `TemplateEditor.tsx`
 * (`nodes` / `edges` / `entryStepId` / `variables`). L'historique undo/redo
 * n'est qu'une pile de snapshots de ce document — aucune source de vérité
 * nouvelle (cf. spec template-editor-undo-redo §Modèle de données).
 */
import type { Edge, Node } from "@xyflow/react";

import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";

export type EditorDoc = {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly entryStepId: string | null;
  readonly variables: readonly TemplateVariableDraft[];
};
