import type { ClockPort } from "../../../wf/application/ports/outbound/clock";
import type { FolderRepo } from "../ports/outbound/folder-repo";
import {
  FolderConflictError,
  FolderNotFoundError,
  validateFolderName,
} from "../../domain/folder";

type Deps = { repo: FolderRepo; clock: ClockPort };

export const makeRenameFolder = ({ repo, clock }: Deps) =>
  async (input: { id: string; name: string }): Promise<void> => {
    const name = validateFolderName(input.name);
    const folder = repo.get({ id: input.id });
    if (!folder) throw new FolderNotFoundError(input.id);
    if (folder.name === name) return;
    const conflict = repo.findByName({
      channelId: folder.channelId,
      parentId: folder.parentId,
      name,
      excludeId: folder.id,
    });
    if (conflict) {
      throw new FolderConflictError(`folder named "${name}" already exists here`);
    }
    repo.rename({ id: input.id, name, now: clock.now() });
  };
