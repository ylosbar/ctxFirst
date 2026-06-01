import fs from "node:fs/promises";
import path from "node:path";
import type { ChannelIconStore } from "../../application/ports/outbound/channel-icon-store";
import type { ChannelIconImageMime } from "../../domain/channel";

type Deps = { rootDir: string };

const extFor = (mime: ChannelIconImageMime): "png" | "jpg" =>
  mime === "image/png" ? "png" : "jpg";

const mimeFromExt = (ext: string): ChannelIconImageMime | null => {
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
};

export const createFsChannelIconStore = ({ rootDir }: Deps): ChannelIconStore => {
  const ensureDir = async () => {
    await fs.mkdir(rootDir, { recursive: true });
  };

  return {
    async put(channelId, image) {
      await ensureDir();
      const ext = extFor(image.mime);
      const target = path.join(rootDir, `${channelId}.${ext}`);
      // If the previous upload used the opposite extension, remove it to
      // avoid orphaning a stale file alongside the new one.
      const otherExt = ext === "png" ? "jpg" : "png";
      await fs
        .rm(path.join(rootDir, `${channelId}.${otherExt}`), { force: true })
        .catch(() => {});
      await fs.writeFile(target, image.bytes);
      return target;
    },

    async read(filePath) {
      try {
        const bytes = await fs.readFile(filePath);
        const mime = mimeFromExt(path.extname(filePath).toLowerCase());
        if (!mime) return null;
        return { bytes, mime };
      } catch {
        return null;
      }
    },

    async remove(filePath) {
      await fs.rm(filePath, { force: true }).catch(() => {});
    },
  };
};
