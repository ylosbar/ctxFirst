/**
 * A channel partitions every scopable entity (templates, skills, artifact
 * types, parsers, instances) by user-defined context. The seed `"personal"`
 * is created at migration time and never deletable.
 */
import {
  ACCEPTED_CHANNEL_IMAGE_MIMES as SHARED_ACCEPTED_MIMES,
  MAX_CHANNEL_IMAGE_BYTES as SHARED_MAX_BYTES,
  type ChannelIconImageMime,
} from "@shared/wf/channel-icon-image";

export type { ChannelIconImageMime };

export type ChannelIconImageInput = {
  mime: ChannelIconImageMime;
  bytes: Uint8Array;
};

export type Channel = {
  id: string;
  name: string;
  description: string;
  color: string | null;
  iconImagePath: string | null;
  iconImageMime: ChannelIconImageMime | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelDraft = {
  id: string;
  name: string;
  description?: string;
  color?: string | null;
  /**
   * Upload d'image : si présent → écrit sur disque et remplace l'image
   * existante. Si explicitement `null` → supprime l'image existante.
   * Si `undefined` → ne touche pas à l'image (cas d'un rename).
   */
  iconImage?: ChannelIconImageInput | null;
};

/** Slug used when no other channel is selected. Created by migration v12. */
export const DEFAULT_CHANNEL_ID = "personal";

/** Restricted to lowercase ASCII / digits / dash to keep slugs DB-friendly. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isValidChannelId = (id: string): boolean => SLUG_RE.test(id);

export const MAX_CHANNEL_IMAGE_BYTES = SHARED_MAX_BYTES;
export const ACCEPTED_CHANNEL_IMAGE_MIMES = SHARED_ACCEPTED_MIMES;
