import { useEffect, useState } from "react";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "./ChannelProvider";

/**
 * Module-level cache of channel-id → blob URL. Keyed by channel id and
 * invalidated wholesale on `channelVersion` bump (active-channel switch or
 * explicit re-save). Centralising the URLs here lets ChannelIcon mount/unmount
 * freely across the switcher and settings panel without leaking — when we
 * `URL.revokeObjectURL` here, every `<img>` still bound to it just shows a
 * broken state until the effect refetches, which happens immediately because
 * the version dep changed.
 */
const cache = new Map<string, string>();
let cachedVersion = -1;

const clearCache = () => {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
};

const ensureCacheForVersion = (version: number) => {
  if (cachedVersion === version) return;
  clearCache();
  cachedVersion = version;
};

/**
 * Loads the uploaded icon image for a channel (if any) as a blob URL. Returns
 * `null` while loading or when the channel has no image. The `hasImage` hint
 * short-circuits the IPC: when the row is known to lack an image, skip the
 * round-trip entirely.
 */
export const useChannelIconImage = (
  channelId: string | null | undefined,
  hasImage: boolean,
): string | null => {
  const { workflowGateway } = useServices();
  const { channelVersion } = useActiveChannel();
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!channelId || !hasImage) return null;
    return cache.get(channelId) ?? null;
  });

  useEffect(() => {
    if (!channelId || !hasImage) {
      setBlobUrl(null);
      return;
    }
    ensureCacheForVersion(channelVersion);
    const cached = cache.get(channelId);
    if (cached) {
      setBlobUrl(cached);
      return;
    }
    let cancelled = false;
    void workflowGateway.getChannelIconImage(channelId).then((res) => {
      if (cancelled || !res) {
        if (!res && !cancelled) setBlobUrl(null);
        return;
      }
      // Another caller may have populated the cache while we were awaiting.
      const existing = cache.get(channelId);
      if (existing) {
        setBlobUrl(existing);
        return;
      }
      const blob = new Blob([res.bytes], { type: res.mime });
      const url = URL.createObjectURL(blob);
      cache.set(channelId, url);
      setBlobUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId, hasImage, channelVersion, workflowGateway]);

  return blobUrl;
};
