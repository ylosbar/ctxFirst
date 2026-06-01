import type { FolderRepo } from "../ports/outbound/folder-repo";
import type { FolderItem } from "../../domain/folder";

type Deps = { repo: FolderRepo };

export const makeListAssignments = ({ repo }: Deps) =>
  async (input: {
    channelId: string;
  }): Promise<ReadonlyArray<FolderItem>> => repo.listItems(input);
