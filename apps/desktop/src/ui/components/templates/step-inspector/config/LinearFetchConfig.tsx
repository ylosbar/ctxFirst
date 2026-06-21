import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedInput } from "../components/buffered-inputs";
import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import { useT } from "../../../../i18n";
import { ACTOR_ROLES } from "../parts/inspector-constants";

type LinearFetchConfigProps = {
  step: TemplateStepDraft;
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const LinearFetchConfig = ({
  step,
  config,
  setConfig,
}: LinearFetchConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.linear.ticketRef.label")}>
        <BufferedInput
          placeholder={t("template.stepInspector.linear.ticketRef.placeholder")}
          value={(config["ticketRef"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ ticketRef: e.target.value })}
        />
      </FormField>
      {step.humanGateRequired ? (
        <FormField
          label={t("template.stepInspector.linear.actorRole.label")}
          description={t("template.stepInspector.linear.actorRole.description")}
        >
          <Select
            value={
              (config["actorRole"] as string | undefined) ??
              step.actorRole
            }
            onChange={(e) => setConfig({ actorRole: e.target.value })}
          >
            {ACTOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
    </>
  );
};

export default LinearFetchConfig;
