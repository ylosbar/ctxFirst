import { Dialog } from "@base-ui/react/dialog";
import { Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useT } from "@/ui/i18n";

type RequiredField = "name" | "id" | "version";

type Props = {
  readonly open: boolean;
  readonly missing: ReadonlyArray<RequiredField>;
  readonly initial: { name: string; id: string; version: string };
  readonly busy: boolean;
  readonly onConfirm: (values: {
    name: string;
    id: string;
    version: string;
  }) => void;
  readonly onCancel: () => void;
};

const TemplateSaveMissingModal = ({
  open,
  missing,
  initial,
  busy,
  onConfirm,
  onCancel,
}: Props) => {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [id, setId] = useState(initial.id);
  const [version, setVersion] = useState(initial.version);

  // Re-sync uniquement sur la transition fermé→ouvert. Le parent recrée l'objet
  // `initial` à chaque rendu : dépendre de sa référence réinitialiserait l'état
  // à chaque frappe (la saisie serait effacée). On suit donc le front montant.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(initial.name);
      setId(initial.id);
      setVersion(initial.version);
    }
    wasOpen.current = open;
  }, [open, initial]);

  const requires = (k: RequiredField) => missing.includes(k);
  const trimmed = {
    name: name.trim(),
    id: id.trim(),
    version: version.trim(),
  };
  const canSubmit =
    !busy &&
    (!requires("name") || trimmed.name.length > 0) &&
    (!requires("id") || trimmed.id.length > 0) &&
    (!requires("version") || trimmed.version.length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({ name: trimmed.name, id: trimmed.id, version: trimmed.version });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Ordre canonique d'affichage : name → id → version. On flague le premier
  // champ rendu pour lui poser l'autoFocus.
  const ordered: ReadonlyArray<RequiredField> = ["name", "id", "version"];
  const visible = ordered.filter((k) => requires(k));
  const firstVisible = visible[0];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[560px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
              {t("templates.saveMissing.title")}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("templates.saveMissing.close")}
              disabled={busy}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
            <p className="text-xs text-muted-foreground">
              {t("templates.saveMissing.body")}
            </p>

            {requires("name") ? (
              <FormField
                label={t("templates.saveMissing.nameLabel")}
                htmlFor="template-missing-name"
              >
                <Input
                  id="template-missing-name"
                  placeholder={t("templates.saveMissing.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                  autoFocus={firstVisible === "name"}
                />
              </FormField>
            ) : null}

            {requires("id") ? (
              <FormField
                label={t("templates.saveMissing.idLabel")}
                htmlFor="template-missing-id"
              >
                <Input
                  id="template-missing-id"
                  placeholder={t("templates.saveMissing.idPlaceholder")}
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                  autoFocus={firstVisible === "id"}
                />
              </FormField>
            ) : null}

            {requires("version") ? (
              <FormField
                label={t("templates.saveMissing.versionLabel")}
                htmlFor="template-missing-version"
              >
                <Input
                  id="template-missing-version"
                  placeholder={t("templates.saveMissing.versionPlaceholder")}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                  autoFocus={firstVisible === "version"}
                />
              </FormField>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {busy ? (
                t("templates.saveMissing.saving")
              ) : (
                <>
                  <Save data-icon="inline-start" className="size-3.5" />
                  {t("common.save")}
                </>
              )}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TemplateSaveMissingModal;
export type { RequiredField };
