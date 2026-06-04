import { Dialog } from "@base-ui/react/dialog";
import { Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";

type Props = {
  readonly open: boolean;
  readonly templateRef: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

/**
 * Confirmation avant publication. La publication fige la ref `id@version`
 * (immuable côté MCP) et la rend invocable comme sous-workflow par un
 * `template.invoke` / `workflow.call`. Pour itérer ensuite, l'utilisateur
 * bumpe la version (ce qui repart d'un brouillon).
 */
const TemplatePublishModal = ({
  open,
  templateRef,
  busy,
  onConfirm,
  onCancel,
}: Props) => {
  const t = useT();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[18vh] z-50 flex w-[480px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2">
              <Rocket className="mt-0.5 size-4 shrink-0 text-foreground" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">
                  {t("template.editor.publish.title")}
                </Dialog.Title>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{templateRef}</span>{" "}
                  {t("template.editor.publish.subtitle")}
                </p>
              </div>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("template.editor.publish.close")}
                  className="shrink-0"
                >
                  <X className="size-4" />
                </Button>
              }
            />
          </div>
          <div className="px-4 py-3 text-xs text-muted-foreground">
            {t("template.editor.publish.body")}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              {t("template.editor.publish.cancel")}
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={busy}>
              {busy
                ? t("template.editor.publish.publishing")
                : t("template.editor.publish.confirm")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TemplatePublishModal;
