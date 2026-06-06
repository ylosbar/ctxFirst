import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import { templateUriFor } from "../../../../features/templates/template-uri";
import useWorkflowTemplates from "../../../../hooks/useWorkflowTemplates";
import { useT } from "../../../../i18n";
import { useWorkbench } from "../../../../workbench/store";
import { portColor } from "../../port-color";
import { PortGroupLabel, PortRow } from "../components/PortRow";
import type { WorkflowCallConfigProps } from "./WorkflowCallConfig";

/**
 * Editor for a `template.invoke` step (`sub-template-invoke.md` §9b). Same shape
 * as {@link WorkflowCallConfig} — pick a sub-template, bind its `input`
 * variables to host variables via `readsFrom` and its `output` variables via
 * `writesTo` — but Approach A (spawns a child instance at runtime) rather than
 * inlining the graph, and with no `passThrough` mode. Reuses the `workflowCall`
 * i18n strings, which are phrased generically around "sub-template".
 */
const TemplateInvokeConfig = ({
  step,
  config,
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

  // Only published templates that expose an interface are invocable (§10 rule 2).
  const isInvocable = (tpl: (typeof templates)[number]): boolean =>
    tpl.status === "published" &&
    tpl.variables.some((v) => v.role === "input" || v.role === "output");
  const invocable = templates.filter(isInvocable);
  const selected = templates.find((tpl) => `${tpl.id}@${tpl.version}` === refKey);
  const pickerValue = selected && isInvocable(selected) ? refKey : "";
  const inputVars = selected?.variables.filter((v) => v.role === "input") ?? [];
  const outputVars = selected?.variables.filter((v) => v.role === "output") ?? [];

  const bind = (mapKey: "readsFrom" | "writesTo", port: string, variableName: string) => {
    const current = { ...(step[mapKey] ?? {}) };
    if (variableName === "") delete current[port];
    else current[port] = variableName;
    onChange({ ...step, [mapKey]: Object.keys(current).length > 0 ? current : undefined });
  };

  const selectTemplate = (key: string) => {
    if (!key) {
      onChange({
        ...step,
        config: { ...config, templateId: "", templateVersion: "" },
        readsFrom: undefined,
        writesTo: undefined,
      });
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
        description={t("template.stepInspector.workflowCall.subTemplate.description")}
      >
        <Select value={pickerValue} onChange={(e) => selectTemplate(e.target.value)}>
          <option value="">
            {loading
              ? t("template.stepInspector.workflowCall.loading")
              : t("template.stepInspector.workflowCall.choose")}
          </option>
          {invocable.map((tpl) => {
            const key = `${tpl.id}@${tpl.version}`;
            return (
              <option key={key} value={key}>
                {tpl.name} ({key})
              </option>
            );
          })}
        </Select>
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

      {inputVars.length > 0 ? (
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

      {outputVars.length > 0 ? (
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

export default TemplateInvokeConfig;
