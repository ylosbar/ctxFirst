import { useEffect } from "react";
import { create } from "zustand";
import type { ArtifactSchemaSourceView } from "../../domain/workflow/types";

// Live snapshot of an open ArtifactSchemaEditor's buffer, published so consumers
// outside the editor's subtree (e.g. the chat's `getChatContext` extractor)
// can read the in-memory state synchronously without going through React props.
export type ArtifactSchemaEditorHandle = {
  readonly uri: string;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly simplifiedSchemaText: string;
  readonly rawSchemaText: string;
  readonly sampleRaw: string;
  readonly isNew: boolean;
  readonly dirty: boolean;
  readonly source: ArtifactSchemaSourceView | null;
};

type ArtifactSchemaEditorState = {
  readonly handles: ReadonlyMap<string, ArtifactSchemaEditorHandle>;
  readonly upsert: (uri: string, handle: ArtifactSchemaEditorHandle) => void;
  readonly remove: (uri: string) => void;
};

export const useArtifactSchemaEditorStore = create<ArtifactSchemaEditorState>((set) => ({
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

export const useRegisterArtifactSchemaEditor = (
  uri: string,
  handle: ArtifactSchemaEditorHandle,
): void => {
  useEffect(() => {
    useArtifactSchemaEditorStore.getState().upsert(uri, handle);
  }, [uri, handle]);
  useEffect(() => {
    return () => useArtifactSchemaEditorStore.getState().remove(uri);
  }, [uri]);
};
