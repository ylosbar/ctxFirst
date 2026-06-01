import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ArtifactSchemaRegistry } from "../../application/ports/outbound/artifact-schema-registry";
import type {
  ArtifactContent,
  ArtifactStore,
  PutArtifactOptions,
} from "../../application/ports/outbound/artifact-store";
import type { ClockPort } from "../../application/ports/outbound/clock";
import type { IdGenerator } from "../../application/ports/outbound/id-generator";
import type { Artifact, ArtifactKind } from "../../domain/artifact";
import { asArtifactHash, asArtifactId, type ArtifactId } from "../../domain/ids";

type Deps = {
  rootDir: string;
  clock: ClockPort;
  ids: IdGenerator;
  /**
   * Schema registry consulted at `put` time to reject malformed payloads
   * before any I/O. Injected so the store can validate without depending on
   * the global resolver wired up at composition time.
   */
  artifactSchemas: ArtifactSchemaRegistry;
};

export const createFsArtifactStore = (deps: Deps): ArtifactStore => {
  const index = new Map<ArtifactId, Artifact>();
  const byHash = new Map<string, ArtifactId>();

  const ensureDir = async () => {
    await fs.mkdir(deps.rootDir, { recursive: true });
  };

  const filePath = (hash: string, ext: "bin" | "meta.json") =>
    path.join(deps.rootDir, `${hash}.${ext}`);

  const loadExistingIndex = async () => {
    await ensureDir();
    const entries = await fs.readdir(deps.rootDir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!name.endsWith(".meta.json")) continue;
      try {
        const raw = await fs.readFile(path.join(deps.rootDir, name), "utf8");
        const meta = JSON.parse(raw) as Artifact;
        index.set(meta.id, meta);
        byHash.set(meta.hash, meta.id);
      } catch {
        // skip corrupt entries
      }
    }
  };

  let initPromise: Promise<void> | null = null;
  const init = () => {
    if (!initPromise) initPromise = loadExistingIndex();
    return initPromise;
  };

  return {
    async put(
      kind: ArtifactKind,
      content: string,
      metadata: Record<string, string> = {},
      options: PutArtifactOptions = {},
    ): Promise<Artifact> {
      await init();
      // Validate **before** any disk I/O so a failed put leaves no orphan
      // `.bin`/`.meta.json` pair behind. Hash-addressing means an existing
      // duplicate would be returned anyway — but we still want to reject
      // garbage from a buggy caller rather than silently dedupe.
      if (!options.skipValidation) {
        const result = deps.artifactSchemas.validate(kind, content);
        if (!result.ok) throw result.error;
      }
      await ensureDir();
      const hash = createHash("sha256").update(content, "utf8").digest("hex");
      const existingId = byHash.get(hash);
      if (existingId) {
        const existing = index.get(existingId);
        if (existing) return existing;
      }
      const id = asArtifactId(deps.ids.newId());
      const createdAt = deps.clock.now();
      const storageRef = filePath(hash, "bin");
      await fs.writeFile(storageRef, content, "utf8");
      const artifact: Artifact = {
        id,
        kind,
        hash: asArtifactHash(hash),
        storageRef,
        metadata,
        createdAt,
      };
      await fs.writeFile(filePath(hash, "meta.json"), JSON.stringify(artifact), "utf8");
      index.set(id, artifact);
      byHash.set(hash, id);
      return artifact;
    },

    async get(id: ArtifactId): Promise<ArtifactContent> {
      await init();
      const meta = index.get(id);
      if (!meta) throw new Error(`artifact not found: ${id}`);
      const content = await fs.readFile(meta.storageRef, "utf8");
      return { meta, content };
    },

    async getByHash(hash: string): Promise<ArtifactContent | null> {
      await init();
      const id = byHash.get(hash);
      if (!id) return null;
      return this.get(id);
    },
  };
};
