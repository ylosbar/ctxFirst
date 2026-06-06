import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import type {
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import { templateUriFor } from "../../../../features/templates/template-uri";
import useWorkflowTemplates from "../../../../hooks/useWorkflowTemplates";
import { useT } from "../../../../i18n";
import { useWorkbench } from "../../../../workbench/store";
import { portColor } from "../../port-color";
import { PortGroupLabel, PortRow } from "../components/PortRow";

export type WorkflowCallConfigProps = {
  step: TemplateStepDraft;
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onChange: (next: TemplateStepDraft) => void;
};

/**
 * Editor for a `workflow.call` step (`sub-template-expand.md` §11a). Picks the
 * sub-template to inline at start, then binds its interface variables
 * (`input` → `readsFrom`, `output` → `writesTo`) onto the host's local
 * variables. The child's ports cannot be resolved by the renderer's
 * `resolveNodeSpec` (they depend on another template), so this component reads
 * the picked template's interface directly rather than going through
 * `PortsWiring`.
 */
const WorkflowCallConfig = ({
  step,
  config,
  setConfig,
  variables,
  onChange,
}: WorkflowCallConfigProps) => {
  const t = useT();
  const { templates, loading } = useWorkflowTemplates();
  const workbench = useWorkbench();

  const templateId = typeof config["templateId"] === "string" ? config["templateId"] : "";
  const templateVersion =
    typeof config["templateVersion"] === "string" ? config["templateVersion"] : "";
  const refKey = templateId && templateVersion ? `${templateId}@${templateVersion}` : "";

  // passThrough (`sub-workflow-passthrough.md`): inline an interface-less
  // sub-template as a pure side-effect sub-routine, wired by control flow only.
  const passThrough = config["passThrough"] === true;

  // Which templates are pickable depends on the mode: with an interface (normal
  // invocation), or without one (passThrough side-effect sub-routine).
  const isInvocable = (t: (typeof templates)[number]): boolean => {
    if (t.status !== "published") return false;
    const hasInterface = t.variables.some((v) => v.role === "input" || v.role === "output");
    return passThrough ? !hasInterface : hasInterface;
  };
  const invocable = templates.filter(isInvocable);
  const selected = templates.find((t) => `${t.id}@${t.version}` === refKey);
  // When the mode flips, a previously-picked template may no longer match the
  // filter — drop it from the picker so it falls back to "— choisir —".
  const pickerValue = selected && isInvocable(selected) ? refKey : "";
  const inputVars = selected?.variables.filter((v) => v.role === "input") ?? [];
  const outputVars = selected?.variables.filter((v) => v.role === "output") ?? [];

  const bind = (mapKey: "readsFrom" | "writesTo", port: string, variableName: string) => {
    const current = { ...(step[mapKey] ?? {}) };
    if (variableName === "") delete current[port];
    else current[port] = variableName;
    onChange({ ...step, [mapKey]: Object.keys(current).length > 0 ? current : undefined });
  };

  // Toggling passThrough clears any residual bindings (they were keyed by the
  // old interface), like selectTemplate does on a ref change.
  const togglePassThrough = (next: boolean) => {
    onChange({
      ...step,
      config: { ...config, passThrough: next },
      readsFrom: undefined,
      writesTo: undefined,
    });
  };

  const selectTemplate = (key: string) => {
    if (!key) {
      // Clear ref + stale bindings (they were keyed by the old interface).
      setConfig({ templateId: "", templateVersion: "" });
      onChange({ ...step, config: { ...config, templateId: "", templateVersion: "" }, readsFrom: undefined, writesTo: undefined });
      return;
    }
    const [id, version] = key.split("@");
    onChange({
      ...step,
      config: { ...config, templateId: id, templateVersion: version },
      readsFrom: undefined,
      writesTo: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label={t("template.stepInspector.workflowCall.subTemplate.label")}
        description={
          passThrough
            ? t("template.stepInspector.workflowCall.subTemplate.descriptionPassThrough")
            : t("template.stepInspector.workflowCall.subTemplate.description")
        }
      >
        <Select value={pickerValue} onChange={(e) => selectTemplate(e.target.value)}>
          <option value="">
            {loading
              ? t("template.stepInspector.workflowCall.loading")
              : t("template.stepInspector.workflowCall.choose")}
          </option>
          {invocable.map((t) => {
            const key = `${t.id}@${t.version}`;
            return (
              <option key={key} value={key}>
                {t.name} ({key})
              </option>
            );
          })}
        </Select>
      </FormField>

      <FormField
        orientation="inline"
        label={t("template.stepInspector.workflowCall.passThrough.label")}
        description={t("template.stepInspector.workflowCall.passThrough.description")}
      >
        <Checkbox checked={passThrough} onCheckedChange={(v) => togglePassThrough(v === true)} />
      </FormField>

      {refKey && !selected ? (
        <p className="text-xs italic text-destructive">
          {t("template.stepInspector.workflowCall.notFound", { refKey })}
        </p>
      ) : null}

      {selected && refKey ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start gap-1.5 text-xs"
          onClick={() => workbench.openEditor(templateUriFor(refKey), { focus: true })}
        >
          <ExternalLink className="size-3.5" />
          {t("template.stepInspector.workflowCall.openSub")}
        </Button>
      ) : null}

      {!passThrough && inputVars.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.workflowCall.inputsLabel")}</PortGroupLabel>
          {inputVars.map((iv) => {
            const candidates = variables.filter((v) => v.kind === iv.kind);
            return (
              <PortRow key={iv.name} name={iv.name} meta={iv.kind} color={portColor([iv.kind])}>
                <Select
                  value={step.readsFrom?.[iv.name] ?? ""}
                  onChange={(e) => bind("readsFrom", iv.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.workflowCall.bindVar")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : null}

      {!passThrough && outputVars.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.workflowCall.outputsLabel")}</PortGroupLabel>
          {outputVars.map((ov) => {
            const candidates = variables.filter((v) => v.kind === ov.kind);
            return (
              <PortRow key={ov.name} name={ov.name} meta={ov.kind} color={portColor([ov.kind])}>
                <Select
                  value={step.writesTo?.[ov.name] ?? ""}
                  onChange={(e) => bind("writesTo", ov.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.wiring.none")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default WorkflowCallConfig;
