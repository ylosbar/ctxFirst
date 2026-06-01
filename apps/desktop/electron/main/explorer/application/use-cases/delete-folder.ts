import type { ClockPort } from "../../../wf/application/ports/outbound/clock";
import type { FolderRepo } from "../ports/outbound/folder-repo";
import { FolderNotFoundError } from "../../domain/folder";

type Deps = { repo: FolderRepo; clock: ClockPort };

type Input = {
  id: string;
  /**
   * `"detach-items"` (default): items and direct sub-folders are re-parented
   * one level up before the folder is removed. `"cascade"`: the SQLite FK
   * cascade wipes the entire sub-tree — items included.
   */
  strategy?: "detach-items" | "cascade";
};

export const makeDeleteFolder = ({ repo, clock }: Deps) =>
  async (input: Input): Promise<void> => {
    const strategy = input.strategy ?? "detach-items";
    const folder = repo.get({ id: input.id });
    if (!folder) throw new FolderNotFoundError(input.id);

    if (strategy === "cascade") {
      repo.delete({ id: input.id });
      return;
    }

    repo.transaction(() => {
      const now = clock.now();
      for (const child of repo.listChildren({ parentId: input.id })) {
        repo.setParent({ id: child.id, parentId: folder.parentId, now });
      }
      repo.reassignItems({
        fromFolderId: input.id,
        toFolderId: folder.parentId,
      });
      repo.delete({ id: input.id });
    });
  };
