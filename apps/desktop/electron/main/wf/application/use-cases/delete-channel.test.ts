import { describe, expect, it, vi } from "vitest";
import { makeDeleteChannel } from "./delete-channel";
import { createFakeChannelContext } from "../../__tests__/fixtures/fake-channel-context";
import { createFakeChannelRegistry } from "../../__tests__/fixtures/fake-registries";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";
import type { Channel } from "../../domain/channel";

const channel = (over: Partial<Channel> = {}): Channel => ({
  id: "acme",
  name: "Acme",
  description: "",
  color: null,
  iconImagePath: null,
  iconImageMime: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const buildDeps = (existing: ReadonlyArray<Channel> = [channel()]) => {
  const channels = createFakeChannelRegistry([
    channel({ id: DEFAULT_CHANNEL_ID, name: "Default" }),
    ...existing,
  ]);
  const channelContext = createFakeChannelContext();
  const channelIcons = {
    put: vi.fn(),
    read: vi.fn(),
    remove: vi.fn(async () => undefined),
  };
  return {
    channels,
    channelContext,
    channelIcons,
    remove: makeDeleteChannel({ channels, channelContext, channelIcons }),
  };
};

describe("deleteChannel use-case", () => {
  it("removes a non-default channel", async () => {
    const { channels, remove } = buildDeps();
    await remove("acme");
    expect(await channels.get("acme")).toBeNull();
  });

  it("refuses to delete the default channel", async () => {
    const { channels, remove } = buildDeps();
    await expect(remove(DEFAULT_CHANNEL_ID)).rejects.toThrow(
      /cannot delete the default channel/,
    );
    expect(await channels.get(DEFAULT_CHANNEL_ID)).not.toBeNull();
  });

  it("removes the icon image file if one was attached", async () => {
    const { channelIcons, remove } = buildDeps([
      channel({ iconImagePath: "/tmp/channel-icons/acme.png" }),
    ]);
    await remove("acme");
    expect(channelIcons.remove).toHaveBeenCalledWith(
      "/tmp/channel-icons/acme.png",
    );
  });

  it("falls back to the default channel when the active one is deleted", async () => {
    const { channelContext, remove } = buildDeps();
    channelContext.setActive("acme");
    await remove("acme");
    expect(channelContext.getActive()).toBe(DEFAULT_CHANNEL_ID);
  });

  it("leaves the active channel untouched when deleting another", async () => {
    const { channelContext, remove } = buildDeps([
      channel({ id: "acme" }),
      channel({ id: "globex", name: "Globex" }),
    ]);
    channelContext.setActive("globex");
    await remove("acme");
    expect(channelContext.getActive()).toBe("globex");
  });
});
