import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";

type OpenrouterInvokeConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const OpenrouterInvokeConfig = ({
  config,
  setConfig,
}: OpenrouterInvokeConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.openrouter.model.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.openrouter.model.description"
            components={{ code: <code /> }}
          />
        }
      >
        <Input
          placeholder={t("template.stepInspector.openrouter.model.placeholder")}
          value={(config["model"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ model: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.fields.maxTokens")}>
        <Input
          type="number"
          min={1}
          value={(config["maxTokens"] as number | undefined) ?? 4000}
          onChange={(e) =>
            setConfig({ maxTokens: Number(e.target.value) })
          }
        />
      </FormField>
    </>
  );
};

export default OpenrouterInvokeConfig;
