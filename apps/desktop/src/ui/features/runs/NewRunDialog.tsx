import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useNavigate } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/ui/i18n";
import useWorkflow from "../../hooks/useWorkflow";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import WorkflowStartForm from "../../components/WorkflowStartForm";
import type { ArtifactKind } from "../../../domain/workflow/types";

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
};

const NewRunDialog = ({ open, onClose }: Props) => {
  const t = useT();
  const navigate = useNavigate();
  const { startWorkflow, busy, error } = useWorkflow(null);
  const {
    templates,
    loading: templatesLoading,
    error: templatesError,
  } = useWorkflowTemplates();

  const handleStart = async (input: {
    templateRef: string;
    seedKind: ArtifactKind;
    content: string;
    cwd?: string;
  }) => {
    const result = await startWorkflow({
      templateRef: input.templateRef,
      seeds: [{ kind: input.seedKind, content: input.content }],
      cwd: input.cwd,
    });
    if (result) navigate(`/runs/${result.instanceId}`, { replace: true });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[640px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">
              {t("runs.newRunDialog.title")}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <ScrollArea className="flex min-h-0 flex-1 flex-col">
            <WorkflowStartForm
              templates={templates}
              busy={busy}
              loading={templatesLoading}
              onStart={handleStart}
            />
            {templatesError ? (
              <div className="px-6 py-2 text-sm text-destructive">
                {templatesError}
              </div>
            ) : null}
            {error ? (
              <div className="px-6 py-2 text-sm text-destructive">{error}</div>
            ) : null}
          </ScrollArea>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default NewRunDialog;
