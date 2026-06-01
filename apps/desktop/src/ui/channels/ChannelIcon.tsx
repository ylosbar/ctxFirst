import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChannelIconImage } from "./useChannelIconImage";

type Props = {
  /** Id du channel — déclenche le chargement de l'image si `hasImage`. */
  channelId?: string | null;
  /** Hint pour ne pas tenter le fetch si on sait qu'il n'y a pas d'image. */
  hasImage?: boolean;
  className?: string;
};

/**
 * Renders a channel's icon. A channel carries at most an optional uploaded
 * image; when none is set (or it fails to load) we fall back to the generic
 * Layers glyph.
 */
const ChannelIcon = ({ channelId, hasImage, className }: Props) => {
  const blobUrl = useChannelIconImage(channelId ?? null, !!hasImage);
  if (blobUrl) {
    return (
      <img
        src={blobUrl}
        alt=""
        className={cn("rounded-[20%] object-cover", className)}
        draggable={false}
      />
    );
  }
  return <Layers className={className} />;
};

export default ChannelIcon;
