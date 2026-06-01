import { useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "./ChannelProvider";
import ImageUploadField, { type ImageUploadValue } from "./ImageUploadField";
import type {
  ChannelIconImageInputView,
  ChannelIconImageMimeView,
} from "../../domain/workflow/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new channel's id once the save round-trip succeeds. */
  onCreated?: (id: string) => void | Promise<void>;
};

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const CreateChannelDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { workflowGateway } = useServices();
  const { bumpVersion } = useActiveChannel();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [imageFile, setImageFile] = useState<ImageUploadValue | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setId("");
    setImageFile(null);
    setSaving(false);
  };

  const onNameChange = (next: string) => {
    setName(next);
    // Auto-suggest the slug until the user types into it directly. Once they
    // touch the slug field, leave it alone — assume intent.
    if (id === "" || id === slugify(name)) {
      setId(slugify(next));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const trimmedName = name.trim();
    const finalId = id.trim();
    if (!trimmedName) {
      toast.error("Le nom est obligatoire");
      return;
    }
    if (!finalId) {
      toast.error("Le slug est obligatoire");
      return;
    }
    setSaving(true);
    try {
      let iconImage: ChannelIconImageInputView | undefined;
      if (imageFile) {
        const buf = await imageFile.file.arrayBuffer();
        iconImage = {
          mime: imageFile.file.type as ChannelIconImageMimeView,
          bytes: new Uint8Array(buf),
        };
      }
      await workflowGateway.saveChannel({
        id: finalId,
        name: trimmedName,
        iconImage,
      });
      bumpVersion();
      toast.success(`Channel "${trimmedName}" créé`);
      if (onCreated) await onCreated(finalId);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex w-[600px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <Dialog.Title className="text-sm font-semibold">
                Nouveau channel
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
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Nom</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  autoFocus
                  className="rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  placeholder="Client Acme"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Slug (id stable, lowercase / digits / dashes)
                </span>
                <input
                  type="text"
                  value={id}
                  onChange={(e) =>
                    setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="rounded border border-input bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary"
                  placeholder="client-acme"
                />
              </label>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Image (PNG ou JPEG, 2 Mo max)
                </span>
                <ImageUploadField value={imageFile} onChange={setImageFile} />
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
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Création…" : "Créer"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CreateChannelDialog;
