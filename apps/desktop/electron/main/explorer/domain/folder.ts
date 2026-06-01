export const RESOURCE_KINDS = [
  "runs",
  "templates",
  "prompts",
  "artifact-schemas",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const isResourceKind = (v: unknown): v is ResourceKind =>
  typeof v === "string" &&
  (RESOURCE_KINDS as ReadonlyArray<string>).includes(v);

export type ExplorerFolder = {
  readonly id: string;
  readonly channelId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type FolderItem = {
  readonly channelId: string;
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly folderId: string;
};

export const MAX_FOLDER_NAME_LENGTH = 80;

export class FolderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderValidationError";
  }
}

export class FolderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderConflictError";
  }
}

export class FolderNotFoundError extends Error {
  constructor(id: string) {
    super(`folder not found: ${id}`);
    this.name = "FolderNotFoundError";
  }
}

export const validateFolderName = (raw: string): string => {
  if (typeof raw !== "string") {
    throw new FolderValidationError("folder name must be a string");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new FolderValidationError("folder name must not be empty");
  }
  if (trimmed.length > MAX_FOLDER_NAME_LENGTH) {
    throw new FolderValidationError(
      `folder name must be ≤ ${MAX_FOLDER_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
};
