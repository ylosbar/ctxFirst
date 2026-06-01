import type { ChannelIconStore } from "../ports/outbound/channel-icon-store";
import type { ChannelRegistry } from "../ports/outbound/channel-registry";
import type {
  ChannelDraft,
  ChannelIconImageInput,
  ChannelIconImageMime,
} from "../../domain/channel";
import {
  ACCEPTED_CHANNEL_IMAGE_MIMES,
  MAX_CHANNEL_IMAGE_BYTES,
  isValidChannelId,
} from "../../domain/channel";

type Deps = {
  channels: ChannelRegistry;
  channelIcons: ChannelIconStore;
};

export type SaveChannel = (draft: ChannelDraft) => Promise<void>;

const hasPngMagic = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e;

const hasJpegMagic = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;

const validateImage = (image: ChannelIconImageInput): void => {
  if (!ACCEPTED_CHANNEL_IMAGE_MIMES.includes(image.mime)) {
    throw new Error(
      `unsupported image mime "${image.mime}" — accepted: PNG or JPEG`,
    );
  }
  if (image.bytes.byteLength > MAX_CHANNEL_IMAGE_BYTES) {
    throw new Error(
      `image too large (${image.bytes.byteLength} bytes) — max ${MAX_CHANNEL_IMAGE_BYTES}`,
    );
  }
  if (image.mime === "image/png" && !hasPngMagic(image.bytes)) {
    throw new Error("image labelled as PNG but bytes don't start with PNG magic");
  }
  if (image.mime === "image/jpeg" && !hasJpegMagic(image.bytes)) {
    throw new Error("image labelled as JPEG but bytes don't start with JPEG magic");
  }
};

export const makeSaveChannel =
  ({ channels, channelIcons }: Deps): SaveChannel =>
  async (draft) => {
    if (!isValidChannelId(draft.id)) {
      throw new Error(
        `invalid channel id "${draft.id}" — use lowercase letters, digits, dashes`,
      );
    }
    if (!draft.name.trim()) {
      throw new Error("channel name must not be empty");
    }

    let iconImagePath: string | null | undefined;
    let iconImageMime: ChannelIconImageMime | null | undefined;

    if (draft.iconImage === null) {
      const existing = await channels.get(draft.id);
      if (existing?.iconImagePath) {
        await channelIcons.remove(existing.iconImagePath);
      }
      iconImagePath = null;
      iconImageMime = null;
    } else if (draft.iconImage) {
      validateImage(draft.iconImage);
      const existing = await channels.get(draft.id);
      if (
        existing?.iconImagePath &&
        existing.iconImageMime !== draft.iconImage.mime
      ) {
        await channelIcons.remove(existing.iconImagePath);
      }
      iconImagePath = await channelIcons.put(draft.id, draft.iconImage);
      iconImageMime = draft.iconImage.mime;
    }

    await channels.save({
      id: draft.id,
      name: draft.name.trim(),
      description: draft.description,
      color: draft.color,
      iconImagePath,
      iconImageMime,
    });
  };
