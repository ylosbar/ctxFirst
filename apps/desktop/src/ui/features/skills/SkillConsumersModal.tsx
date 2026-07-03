import { Dialog } from "@base-ui/react/dialog";
import { ExternalLink, Workflow, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/ui/i18n";
import type { SkillConsumer } from "../../../application/use-cases/collect-skill-consumers";

type Props = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly consumers: ReadonlyArray<SkillConsumer>;
  /** Opens the given template (`id@version`) in an editor tab. */
  readonly onOpen: (templateRef: string) => void;
};

/**
 * Lists the templates that consume the open skill, each a clickable row that
 * opens the template in an adjacent editor tab (and closes the modal). Opened
 * from the toolbar button in {@link SkillEditor}; structure calqued on
 * {@link TemplateDependenciesModal}.
 */
const SkillConsumersModal = ({ open, onOpenChange, consumers, onOpen }: Props) => {
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex max-h-[80vh] w-[560px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2">
              <Workflow className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <Dialog.Title className="text-sm font-semibold text-foreground">
                {t("skills.editor.consumers.modalTitle", {
                  count: consumers.length,
                })}
              </Dialog.Title>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common.close")}
                  className="shrink-0"
                >
                  <X className="size-4" />
                </Button>
              }
            />
          </div>
          <ScrollArea className="max-h-[60vh]">
            {consumers.length === 0 ? (
              <EmptyState description={t("skills.editor.consumers.empty")} />
            ) : (
              <ul className="divide-y divide-border/60">
                {consumers.map((consumer) => {
                  const steps = consumer.usedBySteps
                    .map((s) => s.name)
                    .join(", ");
                  return (
                    <li key={consumer.templateRef}>
                      <button
                        type="button"
                        aria-label={t("skills.editor.consumers.open", {
                          name: consumer.templateName,
                        })}
                        title={t("skills.editor.consumers.steps", { steps })}
                        onClick={() => {
                          onOpen(consumer.templateRef);
                          onOpenChange(false);
                        }}
                        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                      >
                        <Workflow className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">
                              {consumer.templateName}
                            </span>
                            {consumer.status === "draft" ? (
                              <Badge tone="warning" size="sm" className="shrink-0">
                                {t("skills.editor.consumers.draft")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
                            <span className="shrink-0 font-mono">
                              {consumer.templateRef}
                            </span>
                            {steps ? (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
                                />
                                <span className="truncate">{steps}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Dialog.Close
              render={<Button size="sm">{t("common.close")}</Button>}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default SkillConsumersModal;
