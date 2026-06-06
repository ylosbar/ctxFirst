import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import type { TemplateVariableView } from "@shared/wf/types";
import type {
  NodeSpecView,
  StepKindId,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "@/domain/workflow/types";
import type { StepKindMeta } from "@/ui/components/templates/step-kinds";

export type ByKind = ReadonlyMap<StepKindId, NodeSpecView>;

export const buildDefaultStep = (
  kind: StepKindMeta,
  id: string,
): TemplateStepDraft => ({
  id,
  name: kind.label,
  kind: kind.id,
  actorRole: kind.defaultActor,
  humanGateRequired: kind.defaultHumanGateRequired,
  config: kind.buildDefaultConfig(),
});

export const resolveStepSpec = (
  step: TemplateStepDraft,
  byKind: ByKind,
  variables?: ReadonlyArray<TemplateVariableDraft>,
  subTemplates?: ReadonlyMap<string, ReadonlyArray<TemplateVariableView>>,
): NodeSpecView | null => {
  const base = byKind.get(step.kind);
  if (!base) return null;
  return resolveNodeSpec(step.kind, step.config, base, {
    variables,
    subTemplates,
  });
};
