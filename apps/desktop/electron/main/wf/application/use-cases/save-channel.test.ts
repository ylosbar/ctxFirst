import { describe, expect, it, vi } from "vitest";
import { makeSaveChannel } from "./save-channel";
import type { ChannelIconStore } from "../ports/outbound/channel-icon-store";
import type {
  ChannelPersistDraft,
  ChannelRegistry,
} from "../ports/outbound/channel-registry";
import type { Channel } from "../../domain/channel";

const pngBytes = (): Uint8Array => {
  // Minimal PNG signature followed by junk — enough for the magic-number check.
  const bytes = new Uint8Array(8);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  return bytes;
};

const jpegBytes = (): Uint8Array => {
  const bytes = new Uint8Array(4);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
};

type Mocks = {
  channels: ChannelRegistry & {
    save: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  channelIcons: ChannelIconStore & {
    put: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
};

const makeMocks = (existing: Channel | null = null): Mocks => {
  const channels = {
    list: vi.fn(),
    get: vi.fn(async () => existing),
    save: vi.fn(async (_draft: ChannelPersistDraft) => undefined),
    remove: vi.fn(),
  } as Mocks["channels"];
  const channelIcons = {
    put: vi.fn(async (id: string) => `/tmp/channel-icons/${id}.png`),
    read: vi.fn(),
    remove: vi.fn(async () => undefined),
  } as Mocks["channelIcons"];
  return { channels, channelIcons };
};

const baseChannel = (overrides: Partial<Channel> = {}): Channel => ({
  id: "acme",
  name: "Acme",
  description: "",
  color: null,
  iconImagePath: null,
  iconImageMime: null,
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:00:00.000Z",
  ...overrides,
});

describe("saveChannel use-case", () => {
  it("rejects invalid channel ids", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    await expect(save({ id: "Bad ID", name: "x" })).rejects.toThrow(
      /invalid channel id/,
    );
    expect(channels.save).not.toHaveBeenCalled();
  });

  it("rejects empty names", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    await expect(save({ id: "acme", name: "   " })).rejects.toThrow(
      /name must not be empty/,
    );
  });

  it("iconImage=undefined → does not touch the image (no-op)", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    await save({ id: "acme", name: "Acme" });
    expect(channelIcons.put).not.toHaveBeenCalled();
    expect(channelIcons.remove).not.toHaveBeenCalled();
    const saved = channels.save.mock.calls[0][0] as ChannelPersistDraft;
    expect(saved.iconImagePath).toBeUndefined();
    expect(saved.iconImageMime).toBeUndefined();
  });

  it("iconImage=null → clears the existing image (path + mime → null)", async () => {
    const existing = baseChannel({
      iconImagePath: "/tmp/channel-icons/acme.png",
      iconImageMime: "image/png",
    });
    const { channels, channelIcons } = makeMocks(existing);
    const save = makeSaveChannel({ channels, channelIcons });
    await save({ id: "acme", name: "Acme", iconImage: null });
    expect(channelIcons.remove).toHaveBeenCalledWith(
      "/tmp/channel-icons/acme.png",
    );
    const saved = channels.save.mock.calls[0][0] as ChannelPersistDraft;
    expect(saved.iconImagePath).toBeNull();
    expect(saved.iconImageMime).toBeNull();
  });

  it("iconImage={png} → writes file and persists path + mime", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    await save({
      id: "acme",
      name: "Acme",
      iconImage: { mime: "image/png", bytes: pngBytes() },
    });
    expect(channelIcons.put).toHaveBeenCalledTimes(1);
    const saved = channels.save.mock.calls[0][0] as ChannelPersistDraft;
    expect(saved.iconImagePath).toBe("/tmp/channel-icons/acme.png");
    expect(saved.iconImageMime).toBe("image/png");
  });

  it("iconImage with new mime → removes stale file from previous extension", async () => {
    const existing = baseChannel({
      iconImagePath: "/tmp/channel-icons/acme.png",
      iconImageMime: "image/png",
    });
    const { channels, channelIcons } = makeMocks(existing);
    const save = makeSaveChannel({ channels, channelIcons });
    await save({
      id: "acme",
      name: "Acme",
      iconImage: { mime: "image/jpeg", bytes: jpegBytes() },
    });
    expect(channelIcons.remove).toHaveBeenCalledWith(
      "/tmp/channel-icons/acme.png",
    );
    expect(channelIcons.put).toHaveBeenCalledTimes(1);
  });

  it("rejects images with the wrong magic number", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    const fakePng = new Uint8Array([0x00, 0x00, 0x00]);
    await expect(
      save({
        id: "acme",
        name: "Acme",
        iconImage: { mime: "image/png", bytes: fakePng },
      }),
    ).rejects.toThrow(/PNG magic/);
    expect(channelIcons.put).not.toHaveBeenCalled();
  });

  it("rejects images larger than 2 MB", async () => {
    const { channels, channelIcons } = makeMocks();
    const save = makeSaveChannel({ channels, channelIcons });
    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge[0] = 0x89;
    huge[1] = 0x50;
    huge[2] = 0x4e;
    await expect(
      save({
        id: "acme",
        name: "Acme",
        iconImage: { mime: "image/png", bytes: huge },
      }),
    ).rejects.toThrow(/too large/);
  });
});
