/**
 * Constants partagées main ↔ renderer pour l'upload d'image d'icône de
 * channel. Une seule source de vérité (taille max, mimes acceptés) plutôt que
 * de dupliquer les bornes côté UI et côté validation.
 */

export type ChannelIconImageMime = "image/png" | "image/jpeg";

export const MAX_CHANNEL_IMAGE_BYTES = 2 * 1024 * 1024;

export const ACCEPTED_CHANNEL_IMAGE_MIMES: ReadonlyArray<ChannelIconImageMime> = [
  "image/png",
  "image/jpeg",
];
