import type { FolderRepo } from "../ports/outbound/folder-repo";
import type { ExplorerFolder } from "../../domain/folder";

type Deps = { repo: FolderRepo };

export const makeListFolders = ({ repo }: Deps) =>
  async (input: {
    channelId: string;
  }): Promise<ReadonlyArray<ExplorerFolder>> => repo.list(input);
