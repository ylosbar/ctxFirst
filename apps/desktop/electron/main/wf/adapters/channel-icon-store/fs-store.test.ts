import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsChannelIconStore } from "./fs-store";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("createFsChannelIconStore", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "channel-icons-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("put → read round-trip writes bytes and resolves the mime from the extension", async () => {
    const store = createFsChannelIconStore({ rootDir });
    const written = await store.put("acme", {
      mime: "image/png",
      bytes: PNG_BYTES,
    });
    expect(written).toBe(path.join(rootDir, "acme.png"));
    const read = await store.read(written);
    expect(read?.mime).toBe("image/png");
    expect(read?.bytes.equals(Buffer.from(PNG_BYTES))).toBe(true);
  });

  it("switching extension removes the previous file (PNG → JPG)", async () => {
    const store = createFsChannelIconStore({ rootDir });
    await store.put("acme", { mime: "image/png", bytes: PNG_BYTES });
    const newPath = await store.put("acme", {
      mime: "image/jpeg",
      bytes: JPEG_BYTES,
    });
    expect(newPath).toBe(path.join(rootDir, "acme.jpg"));
    const entries = await fs.readdir(rootDir);
    expect(entries).toEqual(["acme.jpg"]);
  });

  it("remove is idempotent when the file is absent", async () => {
    const store = createFsChannelIconStore({ rootDir });
    await expect(
      store.remove(path.join(rootDir, "nope.png")),
    ).resolves.toBeUndefined();
  });

  it("read returns null when the file does not exist", async () => {
    const store = createFsChannelIconStore({ rootDir });
    const result = await store.read(path.join(rootDir, "missing.png"));
    expect(result).toBeNull();
  });
});
