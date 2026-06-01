import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  MissingDepEntry,
  MissingDeps,
} from "../../../application/use-cases/collect-missing-template-deps";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: MissingDeps;
};

const Section = ({
  title,
  entries,
}: {
  title: string;
  entries: ReadonlyArray<MissingDepEntry>;
}) => {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({entries.length})
      </div>
      <ul className="divide-y divide-border/60">
        {entries.map((entry) => (
          <li
            key={entry.ref}
            className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
          >
            <span className="truncate font-mono text-foreground" title={entry.ref}>
              {entry.ref}
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground">
              utilisé par{" "}
              <span className="font-mono text-muted-foreground/90">
                {entry.usedBySteps.join(", ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const TemplateMissingDepsModal = ({ open, onOpenChange, missing }: Props) => {
  const total = missing.skillRefs.length + missing.artifactKinds.length;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex max-h-[80vh] w-[640px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">
                  Dépendances manquantes ({total})
                </Dialog.Title>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ce template référence des ressources absentes de votre
                  environnement. Il est en{" "}
                  <span className="font-mono">draft</span> ; recréez les
                  ressources ou remplacez les refs dans les steps concernés
                  avant publication.
                </p>
              </div>
            </div>
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
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-3 p-4">
              <Section title="Skills manquants" entries={missing.skillRefs} />
              <Section
                title="Artifact types manquants"
                entries={missing.artifactKinds}
              />
            </div>
          </ScrollArea>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Dialog.Close render={<Button size="sm">Fermer</Button>} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TemplateMissingDepsModal;
