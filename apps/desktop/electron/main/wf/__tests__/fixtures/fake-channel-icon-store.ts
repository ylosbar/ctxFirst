import type {
  ChannelIconImageInput,
  ChannelIconImageMime,
} from "../../domain/channel";
import type { ChannelIconStore } from "../../application/ports/outbound/channel-icon-store";

export type FakeChannelIconStore = ChannelIconStore & {
  reset(): void;
};

export const createFakeChannelIconStore = (): FakeChannelIconStore => {
  const blobs = new Map<string, { bytes: Buffer; mime: ChannelIconImageMime }>();

  return {
    async put(channelId, image: ChannelIconImageInput) {
      const path = `mem://channel-icons/${channelId}`;
      blobs.set(path, { bytes: Buffer.from(image.bytes), mime: image.mime });
      return path;
    },
    async read(path) {
      return blobs.get(path) ?? null;
    },
    async remove(path) {
      blobs.delete(path);
    },
    reset() {
      blobs.clear();
    },
  };
};
