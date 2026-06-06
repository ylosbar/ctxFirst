import { Select } from "@/components/ui/select";
import type {
  NodeSpecView,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import { useT } from "../../../../i18n";
import { portColor, portKindsLabel } from "../../port-color";
import { PortGroupLabel, PortRow } from "./PortRow";

type PortsWiringProps = {
  step: TemplateStepDraft;
  spec: NodeSpecView;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onChange: (next: TemplateStepDraft) => void;
};

const PortsWiring = ({
  step,
  spec,
  variables,
  onChange,
}: PortsWiringProps) => {
  const t = useT();
  const writeTo = (port: string, variableName: string | "") => {
    const current = { ...(step.writesTo ?? {}) };
    if (variableName === "") {
      delete current[port];
    } else {
      current[port] = variableName;
    }
    onChange({
      ...step,
      writesTo: Object.keys(current).length > 0 ? current : undefined,
    });
  };

  const readFrom = (port: string, variableName: string | "") => {
    const current = { ...(step.readsFrom ?? {}) };
    if (variableName === "") {
      delete current[port];
    } else {
      current[port] = variableName;
    }
    onChange({
      ...step,
      readsFrom: Object.keys(current).length > 0 ? current : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {spec.inputs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.inputs")}</PortGroupLabel>
          {spec.inputs.map((p) => {
            const candidates = variables.filter(
              (v) => p.kinds.includes("*") || p.kinds.includes(v.kind),
            );
            const current = step.readsFrom?.[p.name] ?? "";
            return (
              <PortRow
                key={p.name}
                name={p.name}
                meta={`${portKindsLabel(p.kinds)}${p.optional ? " · optionnel" : ""}`}
                color={portColor(p.kinds)}
              >
                <Select
                  value={current}
                  onChange={(e) => readFrom(p.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.wiring.upstreamTransition")}</option>
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

      {spec.outputs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.outputs")}</PortGroupLabel>
          {spec.outputs.map((o) => {
            const candidates = variables.filter((v) => v.kind === o.kind);
            const current = step.writesTo?.[o.name] ?? "";
            return (
              <PortRow
                key={o.name}
                name={o.name}
                meta={o.kind}
                color={portColor([o.kind])}
              >
                <Select
                  value={current}
                  onChange={(e) => writeTo(o.name, e.target.value)}
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
      ) : spec.passthrough ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.outputs")}</PortGroupLabel>
          <p className="text-xs italic text-muted-foreground">
            {t("template.stepInspector.wiring.passthrough")}
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default PortsWiring;
