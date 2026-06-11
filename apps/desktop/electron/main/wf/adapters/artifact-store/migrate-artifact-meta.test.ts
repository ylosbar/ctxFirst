import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import {
  forEachArtifactMeta,
  putRewrittenBin,
  type MetaDirective,
} from "./migrate-artifact-meta";
import { migrateLinearTicketToPlugin } from "./migrate-linearticket-to-plugin";
import { migrateLinearRefShape } from "./migrate-linearref-shape";
import { migrateRemovedArtifactKinds } from "./migrate-removed-kinds";

/**
 * `better-sqlite3` is built against the Electron ABI and cannot load in the
 * Node vitest environment (cf. `__tests__/content-addressing.test.ts`). The
 * primitive only ever touches `db` through `prepare(sql).get(key)` /
 * `prepare(sql).run(...)`, so a hand-rolled fake covering exactly those three
 * statements (the `app_settings` guard read/write and the `wf_artifacts`
 * update) is enough — and keeps the test pure-Node.
 */
const createFakeDb = () => {
  const settings = new Map<string, string>();
  const artifacts = new Map<string, { hash: string; storageRef: string }>();

  const db = {
    prepare(sql: string) {
      return {
        get: (key: string) => {
          if (sql.includes("FROM app_settings")) {
            return settings.has(key) ? ({ 1: 1 } as const) : undefined;
          }
          return undefined;
        },
        run: (...args: unknown[]) => {
          if (sql.includes("INSERT INTO app_settings")) {
            const key = args[0] as string;
            if (!settings.has(key)) settings.set(key, "1");
          } else if (sql.includes("UPDATE wf_artifacts")) {
            const [hash, storageRef, id] = args as [string, string, string];
            artifacts.set(id, { hash, storageRef });
          }
        },
      };
    },
  };

  return { db: db as unknown as Database.Database, settings, artifacts };
};

const sha256Hex = (data: string): string =>
  crypto.createHash("sha256").update(data).digest("hex");

/** Writes a `<hash>.bin` + `<hash>.meta.json` pair the way the fs-store does. */
const seedArtifact = async (
  rootDir: string,
  args: { id: string; kind: string; bytes: string },
): Promise<{ hash: string; binPath: string; metaPath: string }> => {
  const hash = sha256Hex(args.bytes);
  const binPath = path.join(rootDir, `${hash}.bin`);
  const metaPath = path.join(rootDir, `${hash}.meta.json`);
  await fs.writeFile(binPath, args.bytes, "utf8");
  await fs.writeFile(
    metaPath,
    JSON.stringify({
      id: args.id,
      kind: args.kind,
      hash,
      storageRef: binPath,
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    "utf8",
  );
  return { hash, binPath, metaPath };
};

const readMeta = async (metaPath: string): Promise<Record<string, unknown>> =>
  JSON.parse(await fs.readFile(metaPath, "utf8")) as Record<string, unknown>;

const MIGRATION_KEY = "test:migration";

describe("forEachArtifactMeta", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-migrate-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("short-circuits and never calls the visitor when already run", async () => {
    const { db, settings } = createFakeDb();
    settings.set(MIGRATION_KEY, "1");
    await seedArtifact(rootDir, { id: "a1", kind: "Keyword", bytes: "{}" });
    const visitor = vi.fn((): MetaDirective => ({ action: "skip" }));

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, visitor);

    expect(visitor).not.toHaveBeenCalled();
  });

  it("marks the migration run on a fresh install (missing dir) without throwing", async () => {
    const { db, settings } = createFakeDb();
    const missing = path.join(rootDir, "does-not-exist");
    const visitor = vi.fn((): MetaDirective => ({ action: "skip" }));

    await forEachArtifactMeta(missing, db, MIGRATION_KEY, visitor);

    expect(visitor).not.toHaveBeenCalled();
    expect(settings.has(MIGRATION_KEY)).toBe(true);
  });

  it("marks the migration run after a full pass (idempotent on re-run)", async () => {
    const { db, settings } = createFakeDb();
    await seedArtifact(rootDir, { id: "a1", kind: "Keyword", bytes: "{}" });
    const visitor = vi.fn((): MetaDirective => ({ action: "skip" }));

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, visitor);
    expect(settings.has(MIGRATION_KEY)).toBe(true);
    expect(visitor).toHaveBeenCalledTimes(1);

    // A second pass short-circuits at the guard.
    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, visitor);
    expect(visitor).toHaveBeenCalledTimes(1);
  });

  it("only visits *.meta.json files and resolves binPath from storageRef", async () => {
    const { db } = createFakeDb();
    const { binPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "Keyword",
      bytes: "payload",
    });
    const seen: Array<{ kind: unknown; binPath: string }> = [];

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, ({ meta, binPath }) => {
      seen.push({ kind: meta.kind, binPath });
      return { action: "skip" };
    });

    // The `.bin` file is not a `.meta.json`, so it is never visited.
    expect(seen).toEqual([{ kind: "Keyword", binPath }]);
  });

  it("skip leaves both files byte-for-byte untouched", async () => {
    const { db, artifacts } = createFakeDb();
    const { metaPath, binPath, hash } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "Markdown",
      bytes: "{}",
    });
    const before = await fs.readFile(metaPath, "utf8");

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, () => ({
      action: "skip",
    }));

    expect(await fs.readFile(metaPath, "utf8")).toBe(before);
    expect(await fs.readFile(binPath, "utf8")).toBe("{}");
    const meta = await readMeta(metaPath);
    expect(meta.hash).toBe(hash);
    expect(artifacts.size).toBe(0);
  });

  it("write-meta persists the mutated meta in place and leaves the bin alone", async () => {
    const { db, artifacts } = createFakeDb();
    const { metaPath, binPath, hash } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearTicket",
      bytes: "untouched-bytes",
    });

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, ({ meta }) => {
      meta.kind = "plugin:linear:Ticket@v1";
      return { action: "write-meta" };
    });

    const meta = await readMeta(metaPath);
    expect(meta.kind).toBe("plugin:linear:Ticket@v1");
    // Bin and hash untouched: label flip never re-addresses.
    expect(meta.hash).toBe(hash);
    expect(await fs.readFile(binPath, "utf8")).toBe("untouched-bytes");
    expect(artifacts.size).toBe(0);
  });

  it("rewrite-bin re-addresses the pair, removes the old files, and syncs wf_artifacts", async () => {
    const { db, artifacts } = createFakeDb();
    const { metaPath, binPath, hash: oldHash } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearRef",
      bytes: JSON.stringify({ ref: "ABC-1" }),
    });

    const newBytes = JSON.stringify({ value: "ABC-1" });
    const newHash = sha256Hex(newBytes);

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, () => ({
      action: "rewrite-bin",
      newBytes,
    }));

    // Old pair gone, new pair present and content-addressed by the new hash.
    expect(await fs.readFile(path.join(rootDir, `${newHash}.bin`), "utf8")).toBe(
      newBytes,
    );
    const newMeta = await readMeta(path.join(rootDir, `${newHash}.meta.json`));
    expect(newMeta.hash).toBe(newHash);
    expect(newMeta.storageRef).toBe(path.join(rootDir, `${newHash}.bin`));
    await expect(fs.access(binPath)).rejects.toThrow();
    await expect(fs.access(metaPath)).rejects.toThrow();

    // wf_artifacts row updated to the new hash + storage_ref.
    expect(artifacts.get("a1")).toEqual({
      hash: newHash,
      storageRef: path.join(rootDir, `${newHash}.bin`),
    });
    expect(oldHash).not.toBe(newHash);
  });

  it("skips meta files that fail to JSON-parse without aborting the pass", async () => {
    const { db } = createFakeDb();
    await fs.writeFile(path.join(rootDir, "broken.meta.json"), "{ not json", "utf8");
    const { metaPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "Keyword",
      bytes: "{}",
    });
    const visited: unknown[] = [];

    await forEachArtifactMeta(rootDir, db, MIGRATION_KEY, ({ meta }) => {
      visited.push(meta.kind);
      return { action: "skip" };
    });

    // Only the well-formed meta was visited; the broken one was skipped.
    expect(visited).toEqual(["Keyword"]);
    expect(await readMeta(metaPath)).toBeTruthy();
  });
});

describe("putRewrittenBin", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-rewrite-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("does not update wf_artifacts when the content (hash) is unchanged", async () => {
    const { db, artifacts } = createFakeDb();
    const bytes = JSON.stringify({ value: "same" });
    const { metaPath, binPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearRef",
      bytes,
    });
    const meta = await readMeta(metaPath);

    await putRewrittenBin({ db, meta, metaPath, binPath, newBytes: bytes });

    // Same bytes → same hash → same filename → no rename, no row update.
    expect(artifacts.size).toBe(0);
    expect(await fs.readFile(binPath, "utf8")).toBe(bytes);
  });

  it("skips the wf_artifacts update when the meta carries no string id", async () => {
    const { db, artifacts } = createFakeDb();
    const hash = sha256Hex("{}");
    const binPath = path.join(rootDir, `${hash}.bin`);
    const metaPath = path.join(rootDir, `${hash}.meta.json`);
    await fs.writeFile(binPath, "{}", "utf8");
    // Meta without an `id` (legacy / corrupt) — the row update is guarded out.
    await fs.writeFile(
      metaPath,
      JSON.stringify({ kind: "LinearRef", hash, storageRef: binPath }),
      "utf8",
    );
    const meta = await readMeta(metaPath);
    const newBytes = JSON.stringify({ value: "X-1" });

    await putRewrittenBin({ db, meta, metaPath, binPath, newBytes });

    expect(artifacts.size).toBe(0);
    expect(
      await fs.readFile(path.join(rootDir, `${sha256Hex(newBytes)}.bin`), "utf8"),
    ).toBe(newBytes);
  });
});

/**
 * The three historical migrations are now thin visitors over the primitive.
 * These guard that each still produces its original on-disk effect, and that
 * the rewrites kept their original `app_settings` keys (idempotence intact on
 * existing DBs).
 */
describe("migration rewrites on the primitive", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-migs-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("migrateLinearTicketToPlugin flips the kind label, bytes untouched", async () => {
    const { db, settings } = createFakeDb();
    const { metaPath, binPath, hash } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearTicket",
      bytes: JSON.stringify({ title: "t" }),
    });

    await migrateLinearTicketToPlugin(rootDir, db);

    const meta = await readMeta(metaPath);
    expect(meta.kind).toBe("plugin:linear:Ticket@v1");
    expect(meta.hash).toBe(hash);
    expect(await fs.readFile(binPath, "utf8")).toBe(JSON.stringify({ title: "t" }));
    expect(settings.has("artifacts:lineartiket-to-plugin")).toBe(true);
  });

  it("migrateLinearRefShape rewrites { ref } → { value } and re-addresses", async () => {
    const { db, settings, artifacts } = createFakeDb();
    const { binPath, metaPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearRef",
      bytes: JSON.stringify({ ref: "ABC-1" }),
    });
    const newBytes = JSON.stringify({ value: "ABC-1" });
    const newHash = sha256Hex(newBytes);

    await migrateLinearRefShape(rootDir, db);

    expect(await fs.readFile(path.join(rootDir, `${newHash}.bin`), "utf8")).toBe(
      newBytes,
    );
    await expect(fs.access(binPath)).rejects.toThrow();
    await expect(fs.access(metaPath)).rejects.toThrow();
    expect(artifacts.get("a1")?.hash).toBe(newHash);
    expect(settings.has("artifacts:linearref-ref-to-value-shape")).toBe(true);
  });

  it("migrateLinearRefShape leaves an already-migrated { value } payload alone", async () => {
    const { db, artifacts } = createFakeDb();
    const bytes = JSON.stringify({ value: "ABC-1" });
    const { binPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "LinearRef",
      bytes,
    });

    await migrateLinearRefShape(rootDir, db);

    expect(await fs.readFile(binPath, "utf8")).toBe(bytes);
    expect(artifacts.size).toBe(0);
  });

  it("migrateRemovedArtifactKinds flips removed text kinds to Markdown (meta only)", async () => {
    const { db } = createFakeDb();
    const { metaPath, binPath, hash } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "TechSpec",
      bytes: JSON.stringify({ format: "markdown", body: "x" }),
    });

    await migrateRemovedArtifactKinds(rootDir, db);

    const meta = await readMeta(metaPath);
    expect(meta.kind).toBe("Markdown");
    expect(meta.hash).toBe(hash);
    expect(await fs.access(binPath)).toBeUndefined();
  });

  it("migrateRemovedArtifactKinds reshapes Keyword { value } → Markdown envelope and re-addresses", async () => {
    const { db, artifacts } = createFakeDb();
    const { binPath, metaPath } = await seedArtifact(rootDir, {
      id: "a1",
      kind: "Keyword",
      bytes: JSON.stringify({ value: "hello" }),
    });
    const newBytes = JSON.stringify({ format: "markdown", body: "hello" });
    const newHash = sha256Hex(newBytes);

    await migrateRemovedArtifactKinds(rootDir, db);

    const newMeta = await readMeta(path.join(rootDir, `${newHash}.meta.json`));
    expect(newMeta.kind).toBe("Markdown");
    expect(newMeta.hash).toBe(newHash);
    expect(await fs.readFile(path.join(rootDir, `${newHash}.bin`), "utf8")).toBe(
      newBytes,
    );
    await expect(fs.access(binPath)).rejects.toThrow();
    await expect(fs.access(metaPath)).rejects.toThrow();
    expect(artifacts.get("a1")?.hash).toBe(newHash);
  });
});
