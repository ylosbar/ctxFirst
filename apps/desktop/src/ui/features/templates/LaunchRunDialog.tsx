import { Dialog } from "@base-ui/react/dialog";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/ui/i18n";
import LaunchInputsFields from "@/ui/components/LaunchInputsFields";
import type { LaunchInput } from "@/application/use-cases/collect-launch-inputs";
import type { ArtifactKind } from "../../../domain/workflow/types";

type Props = {
  readonly open: boolean;
  readonly title: string;
  readonly needsSeed: boolean;
  readonly seedKind: ArtifactKind | null;
  readonly text: string;
  readonly busy: boolean;
  readonly error: string | null;
  /** `promptAtLaunch` variables to collect (launch-input-variables.md §P3). */
  readonly launchInputs: ReadonlyArray<LaunchInput>;
  /** Current value per launch-input name (pre-filled from defaults upstream). */
  readonly values: Record<string, string>;
  readonly onValueChange: (name: string, value: string) => void;
  readonly onTextChange: (text: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
};

const LaunchRunDialog = ({
  open,
  title,
  needsSeed,
  seedKind,
  text,
  busy,
  error,
  launchInputs,
  values,
  onValueChange,
  onTextChange,
  onSubmit,
  onClose,
}: Props) => {
  const t = useT();
  const missingRequired = launchInputs.some(
    (i) => i.required && (values[i.name] ?? "").trim().length === 0,
  );
  const canSubmit =
    !busy && (!needsSeed || text.trim().length > 0) && !missingRequired;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[560px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("templates.launchRun.close")}
              disabled={busy}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {needsSeed ? (
              <div className="flex min-h-0 flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {t("templates.launchRun.seedLabel")}
                  </span>
                  {seedKind ? (
                    <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                      {t("templates.launchRun.expectedInput")}{" "}
                      <span className="font-mono normal-case">{seedKind}</span>
                    </span>
                  ) : null}
                </div>
                <Textarea
                  className="min-h-[180px] flex-1 font-mono text-sm"
                  placeholder={t("templates.launchRun.seedPlaceholder", {
                    kind: seedKind ?? "…",
                  })}
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      if (canSubmit) onSubmit();
                    }
                  }}
                  disabled={busy}
                  autoFocus
                />
              </div>
            ) : launchInputs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("templates.launchRun.noSeedMessage")}
              </p>
            ) : null}
            {launchInputs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-foreground">
                  {t("templates.launchRun.inputsHeading")}
                </span>
                <LaunchInputsFields
                  inputs={launchInputs}
                  values={values}
                  busy={busy}
                  onChange={onValueChange}
                />
              </div>
            ) : null}
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={onSubmit} disabled={!canSubmit}>
              {busy ? (
                t("templates.launchRun.starting")
              ) : (
                <>
                  <Play data-icon="inline-start" className="size-3.5" />
                  {t("templates.launchRun.start")}
                </>
              )}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default LaunchRunDialog;
