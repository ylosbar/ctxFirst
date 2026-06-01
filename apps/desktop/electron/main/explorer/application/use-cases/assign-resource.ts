import type { ClockPort } from "../../../wf/application/ports/outbound/clock";
import type { FolderRepo } from "../ports/outbound/folder-repo";
import {
  FolderNotFoundError,
  FolderValidationError,
  type ResourceKind,
} from "../../domain/folder";

type Deps = { repo: FolderRepo; clock: ClockPort };

type Input = {
  channelId: string;
  kind: ResourceKind;
  resourceId: string;
  folderId: string | null;
};

export const makeAssignResource = ({ repo, clock }: Deps) =>
  async (input: Input): Promise<void> => {
    if (input.folderId === null) {
      repo.deleteItem({
        channelId: input.channelId,
        kind: input.kind,
        resourceId: input.resourceId,
      });
      return;
    }
    const folder = repo.get({ id: input.folderId });
    if (!folder) throw new FolderNotFoundError(input.folderId);
    if (folder.channelId !== input.channelId) {
      throw new FolderValidationError(
        "target folder channel does not match assignment",
      );
    }
    repo.upsertItem({
      channelId: input.channelId,
      kind: input.kind,
      resourceId: input.resourceId,
      folderId: input.folderId,
      now: clock.now(),
    });
  };
