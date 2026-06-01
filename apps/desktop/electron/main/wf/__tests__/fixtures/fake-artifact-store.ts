import type {
  ArtifactContent,
  ArtifactStore,
  PutArtifactOptions,
} from "../../application/ports/outbound/artifact-store";
import type { Artifact, ArtifactKind } from "../../domain/artifact";
import { asArtifactHash, asArtifactId, type ArtifactId } from "../../domain/ids";

type StoredEntry = {
  meta: Artifact;
  content: string;
};

export type FakeArtifactStore = ArtifactStore & {
  /** Read every stored artifact (insertion order). */
  getAll(): ReadonlyArray<StoredEntry>;
  /** Returns the entry by id (test-only assertions). */
  getById(id: ArtifactId): StoredEntry | undefined;
  /** Returns the entry by hash. */
  getByHashSync(hash: string): StoredEntry | undefined;
  reset(): void;
};

type Deps = {
  /**
   * Optional content validator. When provided, called before any store mutation
   * and expected to throw on schema violation. Default: no-op (permissive).
   */
  validate?: (kind: ArtifactKind, content: string) => void;
  /** Synchronous SHA-256 implementation. Default: a fast deterministic hash. */
  sha256?: (content: string) => string;
};

// Tiny deterministic hash for tests — NOT cryptographic. We only need
// deduplication-by-content within a single test process.
const djb2Hash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  // 32-bit unsigned, hex.
  return (h >>> 0).toString(16).padStart(8, "0");
};

export const createFakeArtifactStore = (deps: Deps = {}): FakeArtifactStore => {
  const byId = new Map<ArtifactId, StoredEntry>();
  const byHash = new Map<string, ArtifactId>();
  let counter = 0;
  const sha = deps.sha256 ?? djb2Hash;

  return {
    async put(
      kind: ArtifactKind,
      content: string,
      metadata: Record<string, string> = {},
      options: PutArtifactOptions = {},
    ): Promise<Artifact> {
      if (!options.skipValidation && deps.validate) {
        deps.validate(kind, content);
      }
      const hash = sha(content);
      const existingId = byHash.get(hash);
      if (existingId) {
        const existing = byId.get(existingId);
        if (existing) return existing.meta;
      }
      counter += 1;
      const id = asArtifactId(`artifact-${counter}`);
      const artifact: Artifact = {
        id,
        kind,
        hash: asArtifactHash(hash),
        storageRef: `mem://${hash}`,
        metadata,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      byId.set(id, { meta: artifact, content });
      byHash.set(hash, id);
      return artifact;
    },
    async get(id: ArtifactId): Promise<ArtifactContent> {
      const entry = byId.get(id);
      if (!entry) throw new Error(`artifact not found: ${id}`);
      return { meta: entry.meta, content: entry.content };
    },
    async getByHash(hash: string): Promise<ArtifactContent | null> {
      const id = byHash.get(hash);
      if (!id) return null;
      const entry = byId.get(id);
      if (!entry) return null;
      return { meta: entry.meta, content: entry.content };
    },
    getAll() {
      return [...byId.values()];
    },
    getById(id) {
      return byId.get(id);
    },
    getByHashSync(hash) {
      const id = byHash.get(hash);
      return id ? byId.get(id) : undefined;
    },
    reset() {
      byId.clear();
      byHash.clear();
      counter = 0;
    },
  };
};
