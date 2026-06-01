import type {
  ChannelIconImageInput,
  ChannelIconImageMime,
} from "../../../domain/channel";

/**
 * Outbound port for persisting a channel's icon image bytes outside SQLite.
 * The use-case writes a freshly-uploaded image via `put`, hands the resulting
 * absolute path to the registry, and reads it back through `read` on render.
 */
export type ChannelIconStore = {
  /** Écrit (ou écrase) le fichier image du channel. Retourne le chemin absolu. */
  put(channelId: string, image: ChannelIconImageInput): Promise<string>;
  /** Lit les octets ; null si le fichier n'existe pas. */
  read(path: string): Promise<{ bytes: Buffer; mime: ChannelIconImageMime } | null>;
  /** Supprime le fichier ; no-op si déjà absent. */
  remove(path: string): Promise<void>;
};
