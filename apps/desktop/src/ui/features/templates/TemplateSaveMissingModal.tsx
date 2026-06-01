import { Dialog } from "@base-ui/react/dialog";
import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

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
  const [name, setName] = useState(initial.name);
  const [id, setId] = useState(initial.id);
  const [version, setVersion] = useState(initial.version);

  // Re-sync sur réouverture pour ne pas garder l'état d'une session précédente.
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setId(initial.id);
    setVersion(initial.version);
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
              Compléter le template avant de sauvegarder
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fermer"
              disabled={busy}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
            <p className="text-xs text-muted-foreground">
              Quelques champs obligatoires sont vides. Remplis-les pour pouvoir
              sauvegarder ce template.
            </p>

            {requires("name") ? (
              <FormField label="Nom" htmlFor="template-missing-name">
                <Input
                  id="template-missing-name"
                  placeholder="Mon template"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                  autoFocus={firstVisible === "name"}
                />
              </FormField>
            ) : null}

            {requires("id") ? (
              <FormField label="ID" htmlFor="template-missing-id">
                <Input
                  id="template-missing-id"
                  placeholder="my-flow"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy}
                  autoFocus={firstVisible === "id"}
                />
              </FormField>
            ) : null}

            {requires("version") ? (
              <FormField label="Version" htmlFor="template-missing-version">
                <Input
                  id="template-missing-version"
                  placeholder="v1"
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
              Annuler
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {busy ? (
                "Sauvegarde…"
              ) : (
                <>
                  <Save data-icon="inline-start" className="size-3.5" />
                  Sauvegarder
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
