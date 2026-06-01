import { useEffect } from "react";
import { create } from "zustand";

// Live snapshot of an open SkillEditor's buffer, published so consumers outside
// the editor's subtree (e.g. the chat's `getChatContext` extractor) can read
// the in-memory state synchronously without going through React props.
export type SkillEditorHandle = {
  readonly uri: string;
  readonly ref: string;
  readonly body: string;
  readonly description: string;
  readonly isNew: boolean;
  readonly dirty: boolean;
};

type SkillEditorState = {
  readonly handles: ReadonlyMap<string, SkillEditorHandle>;
  readonly upsert: (uri: string, handle: SkillEditorHandle) => void;
  readonly remove: (uri: string) => void;
};

export const useSkillEditorStore = create<SkillEditorState>((set) => ({
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

export const useRegisterSkillEditor = (
  uri: string,
  handle: SkillEditorHandle,
): void => {
  useEffect(() => {
    useSkillEditorStore.getState().upsert(uri, handle);
  }, [uri, handle]);
  useEffect(() => {
    return () => useSkillEditorStore.getState().remove(uri);
  }, [uri]);
};
