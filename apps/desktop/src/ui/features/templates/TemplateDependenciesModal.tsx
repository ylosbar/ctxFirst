import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertTriangle,
  Boxes,
  Shapes,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/ui/i18n";
import {
  totalTemplateDeps,
  type TemplateDepEntry,
  type TemplateDeps,
} from "../../../application/use-cases/collect-missing-template-deps";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deps: TemplateDeps;
};

const DepsGroup = ({
  title,
  missingLabel,
  icon,
  entries,
}: {
  title: string;
  missingLabel: string;
  icon: ReactNode;
  entries: ReadonlyArray<TemplateDepEntry>;
}) => {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground/70">({entries.length})</span>
      </div>
      <ul className="divide-y divide-border/60">
        {entries.map((entry) => (
          <li
            key={entry.ref}
            className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="truncate font-mono text-foreground"
                title={entry.ref}
              >
                {entry.ref}
              </span>
              {entry.resolved ? null : (
                <Badge tone="danger" size="sm" className="shrink-0 gap-1">
                  <AlertTriangle />
                  {missingLabel}
                </Badge>
              )}
            </span>
            {entry.usedBySteps.length > 0 ? (
              <span
                className="shrink-0 truncate text-2xs text-muted-foreground"
                title={entry.usedBySteps.join(", ")}
              >
                {entry.usedBySteps.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Modale listant **toutes** les dépendances du template (skills/prompts, types
 * d'artifact builtin + dynamiques, sous-templates `workflow.call`), ouverte
 * depuis le bouton dédié de la toolbar. Données read-only fournies par
 * `useTemplateDeps` ; les refs non résolues portent un badge « manquant ».
 */
const TemplateDependenciesModal = ({ open, onOpenChange, deps }: Props) => {
  const t = useT();
  const total = totalTemplateDeps(deps);
  const missingLabel = t("templates.deps.missing");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex max-h-[80vh] w-[640px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2">
              <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <Dialog.Title className="text-sm font-semibold text-foreground">
                {t("templates.deps.panelTitle", { count: total })}
              </Dialog.Title>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("templates.missingDeps.close")}
                  className="shrink-0"
                >
                  <X className="size-4" />
                </Button>
              }
            />
          </div>
          <ScrollArea className="max-h-[60vh]">
            {total === 0 ? (
              <EmptyState description={t("templates.deps.empty")} />
            ) : (
              <div className="flex flex-col gap-3 p-4">
                <DepsGroup
                  title={t("templates.deps.skillsSection")}
                  missingLabel={missingLabel}
                  icon={<Sparkles className="size-3" />}
                  entries={deps.skillRefs}
                />
                <DepsGroup
                  title={t("templates.deps.artifactTypesSection")}
                  missingLabel={missingLabel}
                  icon={<Shapes className="size-3" />}
                  entries={deps.artifactKinds}
                />
                <DepsGroup
                  title={t("templates.deps.subTemplatesSection")}
                  missingLabel={missingLabel}
                  icon={<Workflow className="size-3" />}
                  entries={deps.subTemplates}
                />
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Dialog.Close
              render={
                <Button size="sm">{t("templates.missingDeps.closeButton")}</Button>
              }
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TemplateDependenciesModal;
