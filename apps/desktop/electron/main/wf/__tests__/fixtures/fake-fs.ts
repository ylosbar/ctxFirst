import type { FileSystemPort } from "../../application/ports/outbound/file-system";

export type FakeFileSystem = FileSystemPort & {
  /** Set the content returned for a given absolute path. */
  setFile(absolutePath: string, content: string): void;
  readonly reads: ReadonlyArray<string>;
  reset(): void;
};

export const createFakeFileSystem = (): FakeFileSystem => {
  const files = new Map<string, string>();
  const reads: string[] = [];

  return {
    async readTextFile(absolutePath) {
      reads.push(absolutePath);
      const content = files.get(absolutePath);
      if (content === undefined) {
        throw new Error(`[fake-fs] no file at ${absolutePath}`);
      }
      return content;
    },
    setFile(absolutePath, content) {
      files.set(absolutePath, content);
    },
    get reads() {
      return reads;
    },
    reset() {
      files.clear();
      reads.length = 0;
    },
  };
};
