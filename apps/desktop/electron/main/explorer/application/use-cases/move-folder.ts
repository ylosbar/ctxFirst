import type { ClockPort } from "../../../wf/application/ports/outbound/clock";
import type { FolderRepo } from "../ports/outbound/folder-repo";
import {
  FolderConflictError,
  FolderNotFoundError,
  FolderValidationError,
} from "../../domain/folder";

type Deps = { repo: FolderRepo; clock: ClockPort };

type Input = { id: string; parentId: string | null };

const collectDescendants = (
  repo: FolderRepo,
  rootId: string,
): Set<string> => {
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const child of repo.listChildren({ parentId: id })) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
};

export const makeMoveFolder = ({ repo, clock }: Deps) =>
  async (input: Input): Promise<void> => {
    const folder = repo.get({ id: input.id });
    if (!folder) throw new FolderNotFoundError(input.id);
    if (folder.parentId === input.parentId) return;
    if (input.parentId === input.id) {
      throw new FolderValidationError("cannot move a folder into itself");
    }
    if (input.parentId !== null) {
      const parent = repo.get({ id: input.parentId });
      if (!parent) {
        throw new FolderValidationError(`target folder not found: ${input.parentId}`);
      }
      if (parent.channelId !== folder.channelId) {
        throw new FolderValidationError("cannot move across channels");
      }
      const descendants = collectDescendants(repo, folder.id);
      if (descendants.has(input.parentId)) {
        throw new FolderValidationError("cannot move a folder into its own descendant");
      }
    }
    const conflict = repo.findByName({
      channelId: folder.channelId,
      parentId: input.parentId,
      name: folder.name,
      excludeId: folder.id,
    });
    if (conflict) {
      throw new FolderConflictError(
        `folder named "${folder.name}" already exists in the target`,
      );
    }
    repo.setParent({ id: input.id, parentId: input.parentId, now: clock.now() });
  };
