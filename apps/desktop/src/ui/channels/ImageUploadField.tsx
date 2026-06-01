import { useEffect, useRef } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_CHANNEL_IMAGE_MIMES,
  MAX_CHANNEL_IMAGE_BYTES,
  type ChannelIconImageMime,
} from "@shared/wf/channel-icon-image";

export type ImageUploadValue = {
  file: File;
  previewUrl: string;
};

type Props = {
  value: ImageUploadValue | null;
  onChange: (value: ImageUploadValue | null) => void;
  className?: string;
};

const isAcceptedMime = (mime: string): mime is ChannelIconImageMime =>
  (ACCEPTED_CHANNEL_IMAGE_MIMES as ReadonlyArray<string>).includes(mime);

const ImageUploadField = ({ value, onChange, className }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the blob URL on unmount or when it is replaced — without this, the
  // browser keeps the bytes referenced for the lifetime of the document.
  useEffect(() => {
    const url = value?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [value?.previewUrl]);

  const pickFile = () => inputRef.current?.click();

  const handleSelect = (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedMime(file.type)) {
      toast.error("Format non supporté — PNG ou JPEG uniquement");
      return;
    }
    if (file.size > MAX_CHANNEL_IMAGE_BYTES) {
      toast.error("Image trop volumineuse (2 Mo max)");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    onChange({ file, previewUrl });
  };

  const clear = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
        {value ? (
          <img
            src={value.previewUrl}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <Upload className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {value ? (
          <>
            <span className="font-mono text-2xs text-muted-foreground">
              {value.file.name}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={pickFile}>
                Changer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clear}
                className="text-muted-foreground"
              >
                <X className="mr-1 size-3.5" /> Retirer l'image
              </Button>
            </div>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={pickFile}>
            Choisir un fichier…
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => handleSelect(e.target.files?.[0])}
      />
    </div>
  );
};

export default ImageUploadField;
