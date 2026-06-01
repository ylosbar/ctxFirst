import { AlertCircle, Clock } from "lucide-react";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import type {
  NodeSpecView,
  PortView,
  StepExecutionView,
  TemplateStepView,
  TemplateView,
} from "../../domain/workflow/types";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import StatusBadge from "./StatusBadge";
import { getKindMeta, iconForKind } from "./templates/step-kinds";
import useNodeSpecs from "../hooks/useNodeSpecs";
import { useT } from "../i18n";
import ArtifactView from "./ArtifactView";
import { formatDuration, formatTime } from "./format-exec-time";

type Props = {
  exec: StepExecutionView;
  template: TemplateView | null;
};

type SlotMapping = {
  port: PortView;
  variableName?: string;
  artifactIds: ReadonlyArray<string>;
};

const computeInputSlots = (
  spec: NodeSpecView | null,
  step: TemplateStepView | null,
  template: TemplateView | null,
  inputArtifacts: ReadonlyArray<string>,
): ReadonlyArray<SlotMapping> | null => {
  if (!spec || !step) return null;
  const isSingleInput = spec.inputs.length === 1;
  const transitionsTo = (template?.transitions ?? []).filter(
    (t) => t.to === step.id && !t.isLoop,
  );
  const slots: SlotMapping[] = [];
  let cursor = 0;
  for (const port of spec.inputs) {
    const variableName = step.readsFrom?.[port.name];
    const edges = transitionsTo.filter((t) =>
      t.toPort ? t.toPort === port.name : isSingleInput,
    );
    const hasSource = Boolean(variableName) || edges.length > 0;
    const remaining = Math.max(0, inputArtifacts.length - cursor);
    let count = 0;
    if (port.isList && hasSource) {
      // A list port can accumulate N runtime artifacts from a single static
      // edge — e.g. `loop.collect.item` receives one artifact per iteration
      // of its foreach scope. Consume all remaining inputs so the slot
      // surfaces every collected value, not just the first.
      count = remaining;
    } else if (hasSource) {
      count = 1;
    }
    const available = Math.min(count, remaining);
    const artifactIds = inputArtifacts.slice(cursor, cursor + available);
    cursor += available;
    if (variableName || edges.length > 0 || artifactIds.length > 0) {
      slots.push({ port, variableName, artifactIds });
    }
  }
  return slots;
};

const slotTitle = (
  port: PortView,
  variableName: string | undefined,
  index: number | undefined,
): string => {
  const base = `${port.name}${port.isList && index !== undefined ? ` #${index + 1}` : ""}`;
  return variableName ? `${base} ← $${variableName}` : `${base} ← upstream`;
};

const slotTabClass =
  "shrink-0 rounded px-2 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

type SlotPane = {
  key: string;
  label: string;
  content: React.ReactNode;
};

// Renders the artifact-bearing slots one at a time behind a tab bar. With a
// single pane there is no tab strip; with several, only the active pane mounts
// its (full-height) ArtifactView, so the panel never stacks multiple nested
// scroll areas for long markdown / JSON payloads.
const SlotTabs = ({ panes }: { panes: ReadonlyArray<SlotPane> }) => {
  const [active, setActive] = useState(0);
  if (panes.length === 0) return null;
  if (panes.length === 1) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {panes[0].content}
      </div>
    );
  }
  const safe = Math.min(active, panes.length - 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto">
        {panes.map((pane, i) => (
          <button
            key={pane.key}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === safe}
            className={cn(
              slotTabClass,
              i === safe
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {pane.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {panes[safe].content}
      </div>
    </div>
  );
};

type RowProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
};

const InfoRow = ({ icon, label, value }: RowProps) => (
  <div className="flex items-center gap-2 text-2xs">
    <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
      {icon}
    </span>
    <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 flex-1 break-words font-mono">{value}</span>
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </div>
);

const StepInfoPanel = ({ exec, template }: Props) => {
  const t = useT();
  const step = template?.steps.find((s) => s.id === exec.stepId) ?? null;
  const meta = getKindMeta(step?.kind ?? "");
  const KindIcon = iconForKind(step?.kind ?? "");
  const specs = useNodeSpecs();
  const baseSpec: NodeSpecView | undefined =
    step && specs.status === "ready" ? specs.byKind.get(step.kind) : undefined;
  const spec = step && baseSpec
    ? resolveNodeSpec(step.kind, step.config ?? {}, baseSpec, {
        variables: template?.variables ?? [],
      })
    : null;
  const inputSlots = computeInputSlots(
    spec,
    step,
    template,
    exec.inputArtifacts,
  );

  const startedAt = formatTime(exec.startedAt);
  const endedAt = formatTime(exec.endedAt);
  const duration = formatDuration(exec.startedAt, exec.endedAt);

  const headerIcon = (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 ring-1 ring-inset ring-border/50">
      <KindIcon className="size-3.5 text-muted-foreground" />
    </span>
  );

  // Skill loader: the produced skill is the point of the step, so it leads.
  // Execution metadata is demoted to a discreet footer at the very end.
  if (step?.kind === "skill.loader") {
    const skillRef = (step.config?.["skillRef"] as string | undefined) ?? "";
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <PageHeader
          size="sm"
          title={step.name ?? exec.stepId}
          icon={headerIcon}
          trailing={
            <StatusBadge status={exec.status} className="shrink-0 text-2xs" />
          }
          actions={
            skillRef ? (
              <span className="font-mono text-2xs text-muted-foreground">
                {skillRef}
              </span>
            ) : null
          }
        />

        {exec.error ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <Callout
                tone="danger"
                icon={<AlertCircle className="size-4" />}
                title={t("template.stepInfoPanel.errors.execution")}
              >
                <pre className="m-0 whitespace-pre-wrap font-mono text-xs">
                  {exec.error}
                </pre>
              </Callout>
            </div>
          </ScrollArea>
        ) : exec.outputArtifact ? (
          <div className="min-h-0 flex-1">
            <ArtifactView
              title={skillRef || "Contenu de la skill"}
              artifactId={exec.outputArtifact}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <EmptyState
              className="border-dashed"
              description={
                exec.status === "pending"
                  ? "Étape en attente d'être démarrée."
                  : "Pas encore de contenu produit."
              }
            />
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t bg-muted/20 px-4 py-2 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono">
            <KindIcon className="size-3" />
            {step.kind}
          </span>
          {startedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {startedAt}
            </span>
          ) : null}
          {duration ? <span>· {duration}</span> : null}
        </div>
      </div>
    );
  }

  // Whether an actual artifact preview will be rendered (vs. only dashed
  // "unwired" rows). When true, the preview fills the panel's remaining space
  // (cf. studio output); metadata is demoted to a capped, scrollable header.
  const hasArtifactPreview =
    inputSlots && inputSlots.length > 0
      ? inputSlots.some((s) => s.artifactIds.length > 0)
      : exec.inputArtifacts.length > 0;

  const metaSections = (
    <>
      {meta?.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {meta.description}
        </p>
      ) : null}

      <Card size="sm" tone="muted">
        <CardContent className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <SectionLabel>
              {t("template.stepInfoPanel.execution.title")}
            </SectionLabel>
            <InfoRow
              icon={<KindIcon className="size-3" />}
              label={t("template.stepInfoPanel.execution.kind")}
              value={step?.kind ?? "—"}
            />
            {startedAt ? (
              <InfoRow
                icon={<Clock className="size-3" />}
                label={t("template.stepInfoPanel.execution.startedAt")}
                value={
                  <>
                    {startedAt}
                    {endedAt && endedAt !== startedAt ? ` → ${endedAt}` : null}
                    {duration ? (
                      <span className="text-muted-foreground"> · {duration}</span>
                    ) : null}
                  </>
                }
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {exec.error ? (
        <Callout
          tone="danger"
          icon={<AlertCircle className="size-4" />}
          title={t("template.stepInfoPanel.errors.execution")}
        >
          <pre className="m-0 whitespace-pre-wrap font-mono text-xs">
            {exec.error}
          </pre>
        </Callout>
      ) : null}

      {exec.humanFeedback ? (
        <Callout tone="warning" title={t("template.stepInfoPanel.humanFeedback.title")}>
          {exec.humanFeedback.summary ? (
            <p className="text-xs italic">{exec.humanFeedback.summary}</p>
          ) : null}
          {exec.humanFeedback.comments.length > 0 ? (
            <p className="text-2xs opacity-80">
              {t("template.stepInfoPanel.humanFeedback.inlineComments", {
                count: exec.humanFeedback.comments.length,
              })}
            </p>
          ) : null}
        </Callout>
      ) : null}

      {exec.status === "pending" ? (
        <EmptyState
          className="border-dashed"
          description={t("template.stepInfoPanel.empty.pending")}
        />
      ) : null}
    </>
  );

  // Renders the input artifact previews. Unwired slots stay as compact dashed
  // rows; slots carrying an artifact become tabbed panes (`SlotTabs`) so only
  // one long payload renders at a time, full-height, instead of stacking
  // several nested scroll areas.
  const inputsSection =
    inputSlots && inputSlots.length > 0 ? (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("template.stepInfoPanel.slots.title")}
        </div>
        {inputSlots
          .filter((slot) => slot.artifactIds.length === 0)
          .map((slot) => (
            <div
              key={`empty-${slot.port.name}`}
              className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-dashed bg-muted/10 px-3 py-2 text-2xs text-muted-foreground"
            >
              <span className="font-mono">
                {slot.port.name}
                {slot.variableName ? (
                  <span className="ml-1 text-muted-foreground/80">
                    ← ${slot.variableName}
                  </span>
                ) : null}
              </span>
              <span className="italic">
                {slot.port.optional ? "optionnel, non câblé" : "non résolu"}
              </span>
            </div>
          ))}
        <SlotTabs
          key={exec.id}
          panes={inputSlots.flatMap((slot) =>
            slot.artifactIds.map((aid, i) => ({
              key: `${slot.port.name}-${i}-${aid}`,
              label: `${slot.port.name}${slot.port.isList ? ` #${i + 1}` : ""}`,
              content: (
                <ArtifactView
                  title={slotTitle(
                    slot.port,
                    slot.variableName,
                    slot.port.isList ? i : undefined,
                  )}
                  artifactId={aid}
                />
              ),
            })),
          )}
        />
      </div>
    ) : exec.inputArtifacts.length > 0 ? (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("template.stepInfoPanel.inputs.title")}
        </div>
        <SlotTabs
          key={exec.id}
          panes={exec.inputArtifacts.map((aid, idx) => ({
            key: `fallback-${idx}-${aid}`,
            label:
              exec.inputArtifacts.length > 1 ? `Entrée #${idx + 1}` : "Entrée",
            content: (
              <ArtifactView
                title={
                  exec.inputArtifacts.length > 1 ? `Entrée #${idx + 1}` : "Entrée"
                }
                artifactId={aid}
              />
            ),
          }))}
        />
      </div>
    ) : null;

  const header = (
    <PageHeader
      size="sm"
      title={step?.name ?? exec.stepId}
      icon={headerIcon}
      trailing={
        <StatusBadge status={exec.status} className="shrink-0 text-2xs" />
      }
      actions={
        <span className="font-mono text-2xs text-muted-foreground">
          exec {exec.id.slice(0, 8)}
        </span>
      }
    />
  );

  if (hasArtifactPreview) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {header}
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 max-h-[45%] shrink-0">
            <div className="flex flex-col gap-4 p-4">{metaSections}</div>
          </ScrollArea>
          <div className="flex min-h-0 flex-1 flex-col border-t border-border p-4 pt-3">
            {inputsSection}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {header}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {metaSections}
          {inputsSection}
        </div>
      </ScrollArea>
    </div>
  );
};

export default StepInfoPanel;
