import { useEffect } from "react";
import { create } from "zustand";
import { useActiveEditor } from "../workbench/WorkbenchProvider";
import type {
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../domain/workflow/types";
import type { StepKindMeta } from "../components/templates/step-kinds";
import { isTemplateEditorUri } from "../features/templates/template-uri";

export type SelectedEdgeInfo = {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly isLoop: boolean;
};

// Imperative handle published by an open template editor. Functions on this
// object mutate the editor's internal state — they are not serializable, which
// is why this store is never persisted.
//
// When `mutationEnabled` is false (view-run mode), the mutating callbacks are
// no-ops that warn in dev. Consumers should check the flag before exposing
// write affordances in their UI.
export type TemplateCanvasHandle = {
  readonly uri: string;
  readonly mutationEnabled: boolean;
  readonly selectedStep: TemplateStepDraft | null;
  readonly selectedEdge: SelectedEdgeInfo | null;
  readonly isSelectedEntry: boolean;
  readonly steps: ReadonlyArray<TemplateStepDraft>;
  readonly variables: ReadonlyArray<TemplateVariableDraft>;
  readonly name: string;
  readonly templateId: string;
  readonly version: string;
  readonly description: string;
  readonly setName: (value: string) => void;
  readonly setTemplateId: (value: string) => void;
  readonly setVersion: (value: string) => void;
  readonly setDescription: (value: string) => void;
  readonly addStep: (kind: StepKindMeta) => void;
  readonly updateSelectedStep: (next: TemplateStepDraft) => void;
  readonly deleteSelectedStep: () => void;
  readonly setSelectedAsEntry: () => void;
  readonly toggleSelectedEdgeLoop: () => void;
  readonly deleteSelectedEdge: () => void;
  readonly addVariable: (variable: TemplateVariableDraft) => void;
  readonly updateVariable: (
    previousName: string,
    next: TemplateVariableDraft,
  ) => void;
  readonly deleteVariable: (name: string) => void;
  readonly onRequestCreateSkill: (stepId: string) => void;
};

type TemplateCanvasState = {
  readonly handles: ReadonlyMap<string, TemplateCanvasHandle>;
  readonly upsert: (uri: string, handle: TemplateCanvasHandle) => void;
  readonly remove: (uri: string) => void;
};

export const useTemplateCanvasStore = create<TemplateCanvasState>((set) => ({
  handles: new Map(),
  upsert: (uri, handle) =>
    set((s) => {
      const next = new Map(s.handles);
      next.set(uri, handle);
      return { handles: next };
    }),
  remove: (uri) =>
    set((s) => {
      if (!s.handles.has(uri)) return s;
      const next = new Map(s.handles);
      next.delete(uri);
      return { handles: next };
    }),
}));

// Publishes `handle` under `uri` in the canvas registry for the lifetime of the
// caller. The handle should be a fresh object each render (memoize on its
// inputs) so subscribers re-render when its content changes.
export const useRegisterTemplateCanvas = (
  uri: string,
  handle: TemplateCanvasHandle,
): void => {
  useEffect(() => {
    useTemplateCanvasStore.getState().upsert(uri, handle);
  }, [uri, handle]);
  useEffect(() => {
    return () => useTemplateCanvasStore.getState().remove(uri);
  }, [uri]);
};

export const useTemplateCanvas = (
  uri: string | null,
): TemplateCanvasHandle | null =>
  useTemplateCanvasStore((s) => (uri ? s.handles.get(uri) ?? null : null));

export const useActiveTemplateCanvas = (): TemplateCanvasHandle | null => {
  const activeEditor = useActiveEditor();
  const activeUri =
    activeEditor && isTemplateEditorUri(activeEditor.uri)
      ? activeEditor.uri
      : null;
  return useTemplateCanvas(activeUri);
};
