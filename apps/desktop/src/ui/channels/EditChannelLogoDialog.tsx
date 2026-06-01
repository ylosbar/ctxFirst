import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_CHANNEL_IMAGE_MIMES,
  MAX_CHANNEL_IMAGE_BYTES,
  type ChannelIconImageMime,
} from "@shared/wf/channel-icon-image";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "./ChannelProvider";
import ChannelIcon from "./ChannelIcon";
import { useT } from "@/ui/i18n";
import type {
  ChannelIconImageInputView,
  ChannelIconImageMimeView,
  ChannelView,
} from "../../domain/workflow/types";

type Props = {
  /** Channel whose logo is being edited. `null` keeps the dialog closed. */
  channel: ChannelView | null;
  onOpenChange: (open: boolean) => void;
  /** Called once the save round-trip succeeds, e.g. to refresh the list. */
  onSaved?: () => void | Promise<void>;
};

/**
 * Pending change to the channel's logo:
 *   - `keep`    → leave the stored image untouched (`iconImage: undefined`)
 *   - `replace` → upload a freshly picked file (`iconImage: {...}`)
 *   - `remove`  → drop the stored image (`iconImage: null`)
 */
type Pending =
  | { kind: "keep" }
  | { kind: "replace"; file: File; previewUrl: string }
  | { kind: "remove" };

const isAcceptedMime = (mime: string): mime is ChannelIconImageMime =>
  (ACCEPTED_CHANNEL_IMAGE_MIMES as ReadonlyArray<string>).includes(mime);

const EditChannelLogoDialog = ({ channel, onOpenChange, onSaved }: Props) => {
  const t = useT();
  const { workflowGateway } = useServices();
  const { bumpVersion } = useActiveChannel();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>({ kind: "keep" });
  const [saving, setSaving] = useState(false);

  const open = channel !== null;

  // Reset the pending change every time the dialog opens on a (new) channel.
  useEffect(() => {
    if (open) setPending({ kind: "keep" });
  }, [open, channel?.id]);

  // Revoke the preview blob URL when it is replaced or the dialog closes.
  useEffect(() => {
    const url = pending.kind === "replace" ? pending.previewUrl : undefined;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending]);

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
    setPending({ kind: "replace", file, previewUrl: URL.createObjectURL(file) });
    if (inputRef.current) inputRef.current.value = "";
  };

  const hadImage = !!channel?.iconImagePath;
  // Something is shown in the preview (existing image kept, or a fresh pick).
  const showsImage =
    pending.kind === "replace" || (pending.kind === "keep" && hadImage);
  const canRemove = showsImage;
  const changed = pending.kind !== "keep";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!channel || saving || !changed) return;
    setSaving(true);
    try {
      let iconImage: ChannelIconImageInputView | null | undefined;
      if (pending.kind === "replace") {
        const buf = await pending.file.arrayBuffer();
        iconImage = {
          mime: pending.file.type as ChannelIconImageMimeView,
          bytes: new Uint8Array(buf),
        };
      } else if (pending.kind === "remove") {
        iconImage = null;
      }
      // Re-send the other fields verbatim: the upsert overwrites name /
      // description / color, so omitting them would wipe them.
      await workflowGateway.saveChannel({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        color: channel.color,
        iconImage,
      });
      bumpVersion();
      toast.success("Logo mis à jour");
      if (onSaved) await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex w-[480px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <Dialog.Title className="text-sm font-semibold">
                {t("channels.editLogoDialog.title", { name: channel?.name })}
              </Dialog.Title>
              <Dialog.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fermer"
                    className="shrink-0"
                  >
                    <X className="size-4" />
                  </Button>
                }
              />
            </div>
            <div className="flex flex-col gap-3 p-4">
              <span className="text-xs text-muted-foreground">
                {t("channels.editLogoDialog.imageLabel")}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
                  {pending.kind === "replace" ? (
                    <img
                      src={pending.previewUrl}
                      alt=""
                      className="size-full object-cover"
                      draggable={false}
                    />
                  ) : pending.kind === "keep" && hadImage ? (
                    <ChannelIcon
                      channelId={channel?.id}
                      hasImage
                      className="size-full"
                    />
                  ) : (
                    <Upload className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={pickFile}
                  >
                    {showsImage ? "Changer" : "Choisir un fichier…"}
                  </Button>
                  {canRemove && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPending({ kind: "remove" })}
                      className="text-muted-foreground"
                    >
                      <X className="mr-1 size-3.5" />{" "}
                      {t("channels.editLogoDialog.removeLogo")}
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
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <Dialog.Close
                render={
                  <Button type="button" variant="ghost" size="sm">
                    Annuler
                  </Button>
                }
              />
              <Button type="submit" size="sm" disabled={saving || !changed}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default EditChannelLogoDialog;
