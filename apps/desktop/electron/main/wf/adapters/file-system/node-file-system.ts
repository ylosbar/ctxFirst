import fs from "node:fs/promises";
import type { FileSystemPort } from "../../application/ports/outbound/file-system";

/**
 * Default {@link FileSystemPort} backed by `node:fs/promises`. Read-only:
 * step runners that need to materialize content go through `ArtifactStore`,
 * not this port.
 */
export const createNodeFileSystem = (): FileSystemPort => ({
  async readTextFile(absolutePath) {
    return fs.readFile(absolutePath, "utf-8");
  },
});
