import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ArtifactKind,
  NodeSpecView,
  ScheduleDraftView,
  ScheduleView,
  StepKindId,
  TemplateView,
} from "../../../domain/workflow/types";
import { useServices } from "../../di/services-provider";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import { useT } from "../../i18n";
import { collectLaunchInputs } from "../../../application/use-cases/collect-launch-inputs";
import { CRON_PRESETS } from "./cron-presets";

const getEntrySeedKind = (
  template: TemplateView,
  byKind: ReadonlyMap<StepKindId, NodeSpecView>,
): ArtifactKind | null => {
  const entry = template.steps.find((s) => s.id === template.entryStep);
  if (!entry) return null;
  const base = byKind.get(entry.kind);
  if (!base) return null;
  const spec = resolveNodeSpec(entry.kind, entry.config ?? {}, base);
  return (spec.outputs[0]?.kind as ArtifactKind) ?? null;
};

type Props = {
  readonly open: boolean;
  readonly editing: ScheduleView | null;
  readonly onClose: () => void;
  readonly onSubmit: (draft: ScheduleDraftView) => Promise<void>;
  readonly busy: boolean;
  readonly error: string | null;
};

const ScheduleDialog = ({
  open,
  editing,
  onClose,
  onSubmit,
  busy,
  error,
}: Props) => {
  const t = useT();
  const services = useServices();
  const { templates, loading: templatesLoading } = useWorkflowTemplates();
  const specs = useNodeSpecs();

  const published = useMemo(
    () => templates.filter((t) => t.status === "published"),
    [templates],
  );

  const [name, setName] = useState("");
  const [templateRef, setTemplateRef] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [content, setContent] = useState("");
  const [cwd, setCwd] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTemplateRef(editing.templateRef);
      setCron(editing.cron);
      setContent(editing.seeds[0]?.content ?? "");
      setCwd(editing.cwd ?? "");
    } else {
      setName("");
      setTemplateRef(published[0] ? `${published[0].id}@${published[0].version}` : "");
      setCron("0 9 * * *");
      setContent("");
      setCwd("");
    }
  }, [open, editing, published]);

  const selected = useMemo(
    () => published.find((t) => `${t.id}@${t.version}` === templateRef) ?? null,
    [published, templateRef],
  );

  const seedKind: ArtifactKind =
    selected && specs.status === "ready"
      ? getEntrySeedKind(selected, specs.byKind) ?? "Markdown"
      : "Markdown";

  // A schedule cannot prompt: a template with a required launch input (no
  // default) is not schedulable (the engine guard in `makeSaveSchedule` rejects
  // it). Reflect that by disabling the action and explaining why. (§P3.)
  const requiredLaunchInputs = useMemo(
    () => (selected ? collectLaunchInputs(selected).filter((i) => i.required) : []),
    [selected],
  );
  const hasRequiredLaunchInput = requiredLaunchInputs.length > 0;

  const onPickCwd = async () => {
    const picked = await services.pickDirectory({
      defaultPath: cwd || undefined,
    });
    if (picked) setCwd(picked);
  };

  const canSubmit =
    !busy &&
    !templatesLoading &&
    name.trim().length > 0 &&
    templateRef.length > 0 &&
    cron.trim().length > 0 &&
    content.trim().length > 0 &&
    !hasRequiredLaunchInput;

  const submit = () => {
    if (!canSubmit) return;
    void onSubmit({
      ...(editing ? { id: editing.id } : {}),
      name: name.trim(),
      templateRef,
      cron: cron.trim(),
      seeds: [{ kind: seedKind, content }],
      ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
      enabled: editing ? editing.enabled : true,
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[640px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">
              {editing
                ? t("schedules.dialog.editTitle")
                : t("schedules.dialog.createTitle")}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              disabled={busy}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <ScrollArea className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-4 p-6">
              <FormField label={t("schedules.dialog.nameLabel")}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("schedules.dialog.namePlaceholder")}
                  disabled={busy}
                  autoFocus
                />
              </FormField>

              <FormField label={t("schedules.dialog.templateLabel")}>
                <Select
                  value={templateRef}
                  onChange={(e) => setTemplateRef(e.target.value)}
                  disabled={busy || templatesLoading}
                >
                  {published.length === 0 ? (
                    <option value="">
                      {t("schedules.dialog.noPublishedTemplate")}
                    </option>
                  ) : null}
                  {published.map((t) => {
                    const ref = `${t.id}@${t.version}`;
                    return (
                      <option key={ref} value={ref}>
                        {t.name} ({ref})
                      </option>
                    );
                  })}
                </Select>
                {hasRequiredLaunchInput ? (
                  <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    {t("schedules.dialog.requiredLaunchInput", {
                      names: requiredLaunchInputs.map((i) => i.name).join(", "),
                    })}
                  </p>
                ) : null}
              </FormField>

              <FormField label={t("schedules.dialog.cronLabel")}>
                <div className="flex flex-col gap-2">
                  <Input
                    className="font-mono"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    placeholder="0 9 * * *"
                    disabled={busy}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setCron(p.value)}
                        disabled={busy}
                        className="rounded-full border border-border bg-background px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </FormField>

              <FormField label={t("schedules.dialog.seedLabel", { kind: seedKind })}>
                <Textarea
                  size="sm"
                  className="min-h-[200px] max-h-[40vh] overflow-auto font-mono"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    seedKind === "Markdown"
                      ? t("schedules.dialog.seedPlaceholder")
                      : ""
                  }
                  disabled={busy}
                />
              </FormField>

              <FormField label={t("schedules.dialog.cwdLabel")}>
                <div className="flex items-center gap-2">
                  <Input
                    className="font-mono"
                    placeholder={t("schedules.dialog.cwdPlaceholder")}
                    value={cwd}
                    onChange={(e) => setCwd(e.target.value)}
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void onPickCwd()}
                    disabled={busy}
                  >
                    {t("schedules.dialog.browse")}
                  </Button>
                  {cwd ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCwd("")}
                      disabled={busy}
                    >
                      {t("schedules.dialog.clear")}
                    </Button>
                  ) : null}
                </div>
              </FormField>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {busy
                ? t("schedules.dialog.saving")
                : editing
                  ? t("common.save")
                  : t("schedules.dialog.create")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ScheduleDialog;
