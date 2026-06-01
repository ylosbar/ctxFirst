import { useEffect } from "react";
import { create } from "zustand";
import type { ReviewCommentView } from "../../domain/workflow/types";

/**
 * Live snapshot of an open review editor, keyed by its editor URI. Published by
 * `ReviewEditor` and read synchronously by the `runs.review` editor type's
 * `getChatContext` so the global chatbox sees the output under review plus the
 * user's draft feedback (mirrors `run-panel-store`).
 */
export type ReviewEditorHandle = {
  readonly instanceId: string;
  readonly stepExecId: string;
  readonly stepId: string;
  readonly templateRef: string;
  readonly templateName: string | null;
  readonly loopTargetStepId: string | null;
  readonly content: string | null;
  readonly summary: string;
  readonly draftComments: ReadonlyArray<ReviewCommentView>;
};

type ReviewEditorState = {
  readonly handles: ReadonlyMap<string, ReviewEditorHandle>;
  readonly upsert: (uri: string, handle: ReviewEditorHandle) => void;
  readonly remove: (uri: string) => void;
};

export const useReviewEditorStore = create<ReviewEditorState>((set) => ({
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

// Publishes the live `handle` of the review editor at `uri` while it is mounted,
// so the chat context extractor can read it from outside the editor's subtree.
export const useRegisterReviewEditor = (
  uri: string,
  handle: ReviewEditorHandle | null,
): void => {
  useEffect(() => {
    if (!handle) return;
    useReviewEditorStore.getState().upsert(uri, handle);
  }, [uri, handle]);
  useEffect(() => {
    return () => useReviewEditorStore.getState().remove(uri);
  }, [uri]);
};
