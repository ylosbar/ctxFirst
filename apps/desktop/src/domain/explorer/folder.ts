export const RESOURCE_KINDS = [
  "runs",
  "templates",
  "prompts",
  "artifact-schemas",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type ExplorerFolderView = {
  readonly id: string;
  readonly channelId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type FolderItemAssignment = {
  readonly channelId: string;
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly folderId: string;
};

export type FoldersChangedEvent = {
  readonly channelId: string;
};
