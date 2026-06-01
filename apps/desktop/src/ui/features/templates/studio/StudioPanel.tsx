import { useEffect, useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { useT } from "@/ui/i18n";
import { useServices } from "../../../di/services-provider";
import useNodeSpecs from "../../../hooks/useNodeSpecs";
import { getKindMeta } from "../../../components/templates/step-kinds";
import type {
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../domain/workflow/types";
import StudioInputsForm from "./StudioInputsForm";
import StudioOutput from "./StudioOutput";
import {
  hasNativeSideEffects,
  isKindRunnableInStudio,
} from "./runnable-kinds";
import {
  allRequiredFilled,
  seedFromSpec,
  toIpcInputs,
  type StudioInputDraft,
  type StudioRunState,
} from "./studio-state";

type Props = {
  step: TemplateStepDraft;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onExit: () => void;
};

const StudioPanel = ({ step, variables, onExit }: Props) => {
  const t = useT();
  const services = useServices();
  const specs = useNodeSpecs();
  const meta = getKindMeta(step.kind);
  const base =
    specs.status === "ready" ? specs.byKind.get(step.kind) ?? null : null;
  const resolvedSpec = useMemo(
    () =>
      base
        ? resolveNodeSpec(step.kind, step.config, base, { variables })
        : null,
    [base, step.kind, step.config, variables],
  );

  const runnable = isKindRunnableInStudio(step.kind);
  const showSideEffectWarning = hasNativeSideEffects(step.kind);

  const [inputs, setInputs] = useState<ReadonlyArray<StudioInputDraft>>(() =>
    resolvedSpec ? seedFromSpec(resolvedSpec) : [],
  );
  const [runState, setRunState] = useState<StudioRunState>({ status: "idle" });

  // Reset inputs whenever we switch to a node with a different signature.
  useEffect(() => {
    if (resolvedSpec) setInputs(seedFromSpec(resolvedSpec));
    setRunState({ status: "idle" });
  }, [step.id, resolvedSpec]);

  // Esc → close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const canRun =
    runnable &&
    runState.status !== "running" &&
    resolvedSpec !== null &&
    allRequiredFilled(resolvedSpec, inputs);

  const run = async () => {
    if (!canRun) return;
    const startedAt = Date.now();
    setRunState({ status: "running", startedAt });
    try {
      const result = await services.debugStep({
        step: {
          id: step.id,
          name: step.name,
          kind: step.kind,
          actorRole: step.actorRole,
          config: step.config,
          humanGateRequired: step.humanGateRequired,
          writesTo: step.writesTo,
          readsFrom: step.readsFrom,
          note: step.note,
        },
        inputs: toIpcInputs(inputs),
      });
      setRunState({
        status: "done",
        result,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunState({
        status: "done",
        result: { kind: "error", message },
        durationMs: Date.now() - startedAt,
      });
    }
  };

  const hasOutput = runnable && resolvedSpec !== null && runState.status !== "idle";

  return (
    <div data-template-editor className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("templates.studio.panel.title")}
          </span>
          <span className="truncate text-sm font-medium">{step.name}</span>
          <Badge tone="neutral" font="mono" size="sm">
            {meta?.label ?? step.kind}
          </Badge>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onExit}
          aria-label={t("templates.studio.panel.close")}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {!runnable ? (
        <div className="px-3 py-3">
          <Callout
            tone="info"
            title={t("templates.studio.panel.notRunnableTitle")}
          >
            <code className="font-mono">{step.kind}</code>{" "}
            {t("templates.studio.panel.notRunnableBody")}
          </Callout>
        </div>
      ) : resolvedSpec === null ? (
        <EmptyState
          description={t("templates.studio.panel.loadingSignature")}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Controls — own scroll area; capped so the output keeps room. */}
          <ScrollArea
            className={
              hasOutput ? "min-h-0 max-h-[55%] shrink-0" : "min-h-0 flex-1"
            }
          >
            <div className="flex flex-col gap-3 py-3">
              {showSideEffectWarning ? (
                <div className="px-3">
                  <Callout
                    tone="warning"
                    title={t("templates.studio.panel.sideEffectsTitle")}
                  >
                    {t("templates.studio.panel.sideEffectsBody")}
                  </Callout>
                </div>
              ) : null}

              <StudioInputsForm
                spec={resolvedSpec}
                inputs={inputs}
                onChange={setInputs}
                onSubmit={run}
              />

              <div className="px-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={run}
                  disabled={!canRun}
                  className="w-full"
                >
                  <Play className="mr-1 size-3" />
                  {runState.status === "running"
                    ? t("templates.studio.panel.runningButton")
                    : t("templates.studio.panel.testButton")}
                </Button>
              </div>
            </div>
          </ScrollArea>

          {/* Output — fills the remaining vertical space. */}
          {hasOutput ? (
            <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-2">
              <StudioOutput state={runState} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default StudioPanel;
