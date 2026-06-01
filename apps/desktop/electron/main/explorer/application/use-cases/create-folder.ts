import type { ClockPort } from "../../../wf/application/ports/outbound/clock";
import type { IdGenerator } from "../../../wf/application/ports/outbound/id-generator";
import type { FolderRepo } from "../ports/outbound/folder-repo";
import {
  FolderConflictError,
  FolderValidationError,
  validateFolderName,
  type ExplorerFolder,
} from "../../domain/folder";

type Deps = { repo: FolderRepo; clock: ClockPort; ids: IdGenerator };

type Input = {
  channelId: string;
  parentId: string | null;
  name: string;
};

export const makeCreateFolder = ({ repo, clock, ids }: Deps) =>
  async (input: Input): Promise<ExplorerFolder> => {
    const name = validateFolderName(input.name);
    if (input.parentId !== null) {
      const parent = repo.get({ id: input.parentId });
      if (!parent) {
        throw new FolderValidationError(`parent folder not found: ${input.parentId}`);
      }
      if (parent.channelId !== input.channelId) {
        throw new FolderValidationError("parent folder channel mismatch");
      }
    }
    const existing = repo.findByName({
      channelId: input.channelId,
      parentId: input.parentId,
      name,
    });
    if (existing) {
      throw new FolderConflictError(`folder named "${name}" already exists here`);
    }
    const id = ids.newId();
    const now = clock.now();
    repo.insert({
      id,
      channelId: input.channelId,
      parentId: input.parentId,
      name,
      now,
    });
    return {
      id,
      channelId: input.channelId,
      parentId: input.parentId,
      name,
      createdAt: now,
      updatedAt: now,
    };
  };
