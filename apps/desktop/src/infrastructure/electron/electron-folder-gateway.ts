import type { FolderGateway } from "../../application/ports/folder-gateway";
import type {
  ExplorerFolderView,
  FolderItemAssignment,
  FoldersChangedEvent,
} from "../../domain/explorer/folder";

export const createElectronFolderGateway = (): FolderGateway => ({
  async list({ channelId }) {
    const raw = (await window.api.wf.folders.list({
      channelId,
    })) as ReadonlyArray<ExplorerFolderView>;
    return raw;
  },
  async create(args) {
    const raw = (await window.api.wf.folders.create(args)) as ExplorerFolderView;
    return raw;
  },
  async rename(args) {
    await window.api.wf.folders.rename(args);
  },
  async remove(args) {
    await window.api.wf.folders.remove(args);
  },
  async move(args) {
    await window.api.wf.folders.move(args);
  },
  async listItems({ channelId }) {
    const raw = (await window.api.wf.folders.listItems({
      channelId,
    })) as ReadonlyArray<FolderItemAssignment>;
    return raw;
  },
  async assign(args) {
    await window.api.wf.folders.assign(args);
  },
  onChanged(listener) {
    return window.api.wf.folders.onChanged((evt) => {
      const typed: FoldersChangedEvent = { channelId: evt.channelId };
      listener(typed);
    });
  },
});
