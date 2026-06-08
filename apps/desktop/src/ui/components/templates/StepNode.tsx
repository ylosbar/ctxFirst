import { createContext, memo, useContext, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Cog } from "lucide-react";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import type { TemplateVariableView } from "@shared/wf/types";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { STATUS_STYLE } from "@/components/ui/step-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatExecDuration, formatTime } from "../format-exec-time";
import { useT } from "../../i18n";
import type {
  NodeSpecView,
  PortKindMatcher,
  TemplateStepDraft,
} from "../../../domain/workflow/types";
import type { StepExecutionOverlay } from "../../features/templates/run-overlay";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import { accentForKind, getKindMeta, iconForKind } from "./step-kinds";
import { portColor, portKindsLabel } from "./port-color";

export type StepNodeData = TemplateStepDraft & {
  isEntry: boolean;
  executionOverlay?: StepExecutionOverlay;
  /** Transient flag set by `addStep` for a node freshly dropped from the picker.
   *  Triggers the landing "pop" animation; the editor clears it once the
   *  animation has finished so re-renders don't replay it. */
  justDropped?: boolean;
};

const overlayBorderClass = (overlay: StepExecutionOverlay): string => {
  if (!overlay.latest) return "border-border/60 opacity-50";
  // Une étape réussie ("validated") n'est pas teintée sur le node lui-même :
  // le path exécuté est porté par l'edge vert uniquement. On garde les
  // couleurs de statut pour les états en cours / en attente / échoué.
  if (overlay.latest.status === "validated") return "border-border";
  const style = STATUS_STYLE[overlay.latest.status];
  return cn(style.border, style.text);
};

const NotesVisibilityContext = createContext<boolean>(false);

export const NotesVisibilityProvider = NotesVisibilityContext.Provider;

const useNotesVisible = (): boolean => useContext(NotesVisibilityContext);

const portHandleStyle = (
  kinds: ReadonlyArray<PortKindMatcher>,
  isList: boolean = false,
): React.CSSProperties => ({
  background: portColor(kinds),
  width: 8,
  height: 8,
  border: isList
    ? "1.5px dashed var(--background)"
    : "1px solid var(--background)",
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
});

/**
 * Subtitle for a `workflow.call` node (`sub-template-expand.md` §11b): the ⊞
 * "sub-flow" glyph plus the referenced sub-template ref, or a prompt to pick
 * one when unconfigured.
 */
const subWorkflowLabel = (config: Readonly<Record<string, unknown>>): string => {
  const id = typeof config["templateId"] === "string" ? config["templateId"] : "";
  const version =
    typeof config["templateVersion"] === "string" ? config["templateVersion"] : "";
  if (!id || !version) return "⊞ (choisir un sous-template)";
  // passThrough (`sub-workflow-passthrough.md`): a control-flow-only sub-routine
  // with no data exchanged — flag it so the graph reads unambiguously.
  const passThrough = config["passThrough"] === true;
  return passThrough ? `⊞ ${id}@${version} · sans données` : `⊞ ${id}@${version}`;
};

/**
 * Subtitle for a `template.invoke` node (`sub-template-invoke.md` §9c): the ↳
 * "spawn child" glyph plus the referenced sub-template ref. Distinct from the ⊞
 * `workflow.call` glyph so the graph reads "inline" vs "spawn child" at a
 * glance.
 */
const subInvokeLabel = (config: Readonly<Record<string, unknown>>): string => {
  const id = typeof config["templateId"] === "string" ? config["templateId"] : "";
  const version =
    typeof config["templateVersion"] === "string" ? config["templateVersion"] : "";
  if (!id || !version) return "↳ (choisir un sous-template)";
  return `↳ ${id}@${version}`;
};

const StepNode = ({ data, selected }: NodeProps) => {
  const t = useT();
  const step = data as unknown as StepNodeData;
  const meta = getKindMeta(step.kind);
  const KindIcon = iconForKind(step.kind);
  const accent = accentForKind(step.kind);
  const specs = useNodeSpecs();
  const base: NodeSpecView | undefined =
    specs.status === "ready" ? specs.byKind.get(step.kind) : undefined;
  // A `workflow.call` node derives its ports from the referenced sub-template's
  // interface variables (the kind-keyed catalog can't), so feed `resolveNodeSpec`
  // a ref→variables map built from the loaded templates. Cheap & shared: the
  // query is cached, the map is memoized.
  const { templates } = useWorkflowTemplates();
  const subTemplates = useMemo(() => {
    const map = new Map<string, ReadonlyArray<TemplateVariableView>>();
    for (const tpl of templates) {
      map.set(
        `${tpl.id}@${tpl.version}`,
        tpl.variables.map((v) => ({
          name: v.name,
          kind: v.kind,
          role: v.role,
          description: v.description,
          defaultValue: v.defaultValue,
        })),
      );
    }
    return map;
  }, [templates]);
  const spec = base
    ? resolveNodeSpec(step.kind, step.config, base, { subTemplates })
    : null;
  const notesVisible = useNotesVisible();
  const showNote =
    notesVisible && typeof step.note === "string" && step.note.length > 0;

  const inputs = spec?.inputs ?? [];
  const outputs = spec?.outputs ?? [];
  // Side-effect "command" nodes (e.g. `workspace.set`) have `outputs: []` but
  // stay chainable via `passthrough`. We render a neutral source handle so
  // users can drag downstream connections.
  const hasPassthroughHandle =
    outputs.length === 0 && Boolean(spec?.passthrough);

  const overlay = step.executionOverlay;
  const overlayLatest = overlay?.latest ?? null;
  const overlayOff = overlay !== undefined && overlayLatest === null;
  const isRunning = overlayLatest?.status === "running";
  const isAwaitingHuman = overlayLatest?.status === "awaitingHuman";
  const isFailed = overlayLatest?.status === "failed";

  const overlayTooltip = (() => {
    if (!overlayLatest) return undefined;
    const parts: string[] = [overlayLatest.status];
    const started = formatTime(overlayLatest.startedAt);
    const duration = formatExecDuration(overlayLatest);
    if (started) parts.push(`démarrée ${started}`);
    if (duration) parts.push(`durée ${duration}`);
    if (overlayLatest.error) parts.push(`erreur: ${overlayLatest.error}`);
    return parts.join(" · ");
  })();

  return (
    <div
      className={cn(
        "relative min-w-[210px] rounded-2xl border shadow-[0_6px_18px_-6px_rgb(0_0_0/0.22),0_2px_6px_-2px_rgb(0_0_0/0.12)] transition-all",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-[0_0_16px_-2px_color-mix(in_srgb,var(--primary)_45%,transparent),0_6px_18px_-6px_rgb(0_0_0/0.22),0_2px_6px_-2px_rgb(0_0_0/0.12)]"
          : "border-border",
        overlay
          ? cn(
              overlayBorderClass(overlay),
              overlayOff && "opacity-40",
              isRunning &&
                "border-2 ring-2 ring-blue-500/40 shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-blue-500)_20%,transparent)] animate-pulse",
              isAwaitingHuman && "border-2 ring-2 ring-amber-500/40",
              isFailed &&
                "border-2 ring-2 ring-destructive/50 shadow-[0_0_0_4px_color-mix(in_srgb,var(--destructive)_20%,transparent)]",
            )
          : null,
        step.justDropped && "animate-node-drop-pop",
      )}
      title={overlayTooltip}
      data-status={overlayLatest?.status}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 8%, var(--card)) 0%, color-mix(in srgb, var(--card) 55%, transparent) 100%)`,
      }}
    >
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 0 4px 0 color-mix(in srgb, ${accent} 35%, transparent), 0 1px 2px 0 color-mix(in srgb, ${accent} 25%, transparent)`,
          }}
        >
          {isRunning || isAwaitingHuman ? (
            <Cog
              className={cn(
                "h-3.5 w-3.5 animate-spin",
                isAwaitingHuman ? "text-amber-500" : "text-blue-500",
              )}
            />
          ) : (
            <KindIcon className="h-3.5 w-3.5" style={{ color: accent }} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-2xs font-medium leading-tight">
              {step.name || t("template.canvas.stepNode.unnamed")}
            </span>
            {step.humanGateRequired ? (
              <Badge
                variant="secondary"
                className="h-3.5 px-1 text-2xs leading-none"
              >
                {t("template.canvas.stepNode.gateBadge")}
              </Badge>
            ) : null}
            {isAwaitingHuman ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="secondary"
                      className="h-3.5 px-1 text-2xs leading-none"
                    >
                      👤
                    </Badge>
                  }
                />
                <TooltipContent>{t("template.canvas.stepNode.awaitingHuman")}</TooltipContent>
              </Tooltip>
            ) : null}
            {overlay && overlay.iterationCount > 1 ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="outline"
                      className="h-3.5 px-1 text-2xs leading-none"
                    >
                      ×{overlay.iterationCount}
                    </Badge>
                  }
                />
                <TooltipContent>{t("template.canvas.stepNode.executions", { count: overlay.iterationCount })}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <span className="truncate text-2xs leading-tight text-muted-foreground/80">
            {step.kind === "workflow.call"
              ? subWorkflowLabel(step.config)
              : step.kind === "template.invoke"
                ? subInvokeLabel(step.config)
                : meta?.label ?? step.kind}
          </span>
        </div>
      </div>

      <div className="flex border-t border-border/50">
        <div className="flex min-w-0 flex-1 flex-col py-1">
          {inputs.length === 0 ? (
            <div className="relative flex h-4 items-center px-2.5">
              <Handle
                type="target"
                position={Position.Left}
                style={{ ...portHandleStyle(["*"]), left: -4 }}
                title={t("template.canvas.stepNode.passthroughTargetTooltip")}
                aria-label={t("template.canvas.stepNode.passthroughTargetAria")}
              />
              <span className="truncate text-2xs italic text-muted-foreground/60">
                {t("template.canvas.stepNode.passthrough")}
              </span>
            </div>
          ) : (
            inputs.map((port) => {
              const readsFromVar = step.readsFrom?.[port.name];
              const suffix =
                (port.isList ? "[…]" : "") + (port.optional ? "?" : "");
              const primaryHint = port.primary ? " — primary" : "";
              const tooltip = readsFromVar
                ? `${port.name} ← variable "${readsFromVar}" (${portKindsLabel(port.kinds)})${suffix}${primaryHint}`
                : `${port.name} ← ${portKindsLabel(port.kinds)}${suffix}${primaryHint}`;
              return (
                <div
                  key={port.name}
                  className="relative flex h-4 items-center gap-1 px-2.5"
                  title={tooltip}
                >
                  <Handle
                    id={port.name}
                    type="target"
                    position={Position.Left}
                    style={{
                      ...portHandleStyle(port.kinds, port.isList),
                      left: -4,
                    }}
                    aria-label={`${port.name} accepts ${portKindsLabel(port.kinds)}${suffix}${primaryHint}`}
                  />
                  <span
                    className={cn(
                      "truncate text-2xs leading-none",
                      port.primary
                        ? "font-semibold text-foreground"
                        : "text-foreground/80",
                    )}
                  >
                    {port.name}
                    {port.optional ? (
                      <span className="text-muted-foreground/60">?</span>
                    ) : null}
                    {port.isList ? (
                      <span className="text-muted-foreground/60">{t("template.canvas.stepNode.listMarker")}</span>
                    ) : null}
                  </span>
                  {readsFromVar ? (
                    <span className="truncate text-2xs leading-none text-muted-foreground/60">
                      ${readsFromVar}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {outputs.length > 0 || hasPassthroughHandle ? (
          <div className="flex min-w-0 flex-col py-1">
            {hasPassthroughHandle ? (
              <div className="relative flex h-4 items-center justify-end px-2.5">
                <span className="truncate text-2xs italic text-muted-foreground/60">
                  {t("template.canvas.stepNode.passthrough")}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  style={{ ...portHandleStyle(["*"]), right: -4 }}
                  title={t("template.canvas.stepNode.passthroughSourceTooltip")}
                  aria-label={t("template.canvas.stepNode.passthroughSourceAria")}
                />
              </div>
            ) : (
              outputs.map((port) => {
                const writesToVar = step.writesTo?.[port.name];
                const primaryHint = port.primary ? " — primary" : "";
                const tooltip = writesToVar
                  ? `${port.name} → ${port.kind} → $${writesToVar}${
                      port.description ? ` — ${port.description}` : ""
                    }${primaryHint}`
                  : port.description
                    ? `${port.name} → ${port.kind} — ${port.description}${primaryHint}`
                    : `${port.name} → ${port.kind}${primaryHint}`;
                return (
                  <div
                    key={port.name}
                    className="relative flex h-4 items-center justify-end gap-1 px-2.5"
                    title={tooltip}
                  >
                    {writesToVar ? (
                      <span className="truncate text-2xs leading-none text-muted-foreground/60">
                        ${writesToVar}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "truncate text-2xs leading-none",
                        port.primary
                          ? "font-semibold text-foreground"
                          : "text-foreground/80",
                      )}
                    >
                      {port.name}
                    </span>
                    <Handle
                      id={port.name}
                      type="source"
                      position={Position.Right}
                      style={{
                        ...portHandleStyle([port.kind]),
                        right: -4,
                      }}
                      aria-label={`${port.name} produces ${port.kind}${primaryHint}`}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
      {showNote ? (
        <Callout
          tone="warning"
          icon={null}
          className="rounded-none rounded-b-2xl border-0 border-t border-dashed border-border/70 p-0 px-2 py-1 text-3xs leading-tight whitespace-pre-wrap [&_[data-slot=callout-icon]]:hidden"
        >
          {step.note}
        </Callout>
      ) : null}
    </div>
  );
};

export default memo(StepNode);
