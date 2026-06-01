import { useCallback, useEffect, useMemo, useState } from "react";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import type {
  ExplorerFolderView,
  ResourceKind,
} from "../../domain/explorer/folder";

type UseExplorerFolders = {
  folders: ReadonlyArray<ExplorerFolderView>;
  /** `${kind}:${resourceId}` → folderId. Composite key prevents collisions between
   *  templates and artifact-schemas, which share the `id@version` ref format. */
  items: ReadonlyMap<string, string>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createFolder: (parentId: string | null, name: string) => Promise<ExplorerFolderView>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (id: string, newParentId: string | null) => Promise<void>;
  assign: (
    kind: ResourceKind,
    resourceId: string,
    folderId: string | null,
  ) => Promise<void>;
};

const useExplorerFolders = (): UseExplorerFolders => {
  const { folderGateway } = useServices();
  const { activeChannelId, channelVersion } = useActiveChannel();

  const [folders, setFolders] = useState<ReadonlyArray<ExplorerFolderView>>([]);
  const [items, setItems] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [foldersList, assignments] = await Promise.all([
        folderGateway.list({ channelId: activeChannelId }),
        folderGateway.listItems({ channelId: activeChannelId }),
      ]);
      setFolders(foldersList);
      const map = new Map<string, string>();
      for (const a of assignments) {
        map.set(`${a.kind}:${a.resourceId}`, a.folderId);
      }
      setItems(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [folderGateway, activeChannelId]);

  useEffect(() => {
    void refresh();
  }, [refresh, channelVersion]);

  useEffect(() => {
    const unsub = folderGateway.onChanged((evt) => {
      if (evt.channelId !== activeChannelId) return;
      void refresh();
    });
    return unsub;
  }, [folderGateway, activeChannelId, refresh]);

  const createFolder = useCallback(
    async (parentId: string | null, name: string) => {
      return folderGateway.create({
        channelId: activeChannelId,
        parentId,
        name,
      });
    },
    [folderGateway, activeChannelId],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await folderGateway.rename({ id, name });
    },
    [folderGateway],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await folderGateway.remove({ id });
    },
    [folderGateway],
  );

  const moveFolder = useCallback(
    async (id: string, newParentId: string | null) => {
      await folderGateway.move({ id, parentId: newParentId });
    },
    [folderGateway],
  );

  const assign = useCallback(
    async (
      kind: ResourceKind,
      resourceId: string,
      folderId: string | null,
    ) => {
      await folderGateway.assign({
        channelId: activeChannelId,
        kind,
        resourceId,
        folderId,
      });
    },
    [folderGateway, activeChannelId],
  );

  return useMemo(
    () => ({
      folders,
      items,
      loading,
      error,
      refresh,
      createFolder,
      renameFolder,
      deleteFolder,
      moveFolder,
      assign,
    }),
    [
      folders,
      items,
      loading,
      error,
      refresh,
      createFolder,
      renameFolder,
      deleteFolder,
      moveFolder,
      assign,
    ],
  );
};

export default useExplorerFolders;
