import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type LinearTriageFetchConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const LinearTriageFetchConfig = ({
  config,
  setConfig,
}: LinearTriageFetchConfigProps) => {
  const t = useT();
  return (
    <FormField
      label={t("template.stepInspector.linear.triageLimit.label")}
      description={t("template.stepInspector.linear.triageLimit.description")}
    >
      <BufferedInput
        type="number"
        min={1}
        max={250}
        value={(config["limit"] as number | undefined) ?? 10}
        onChange={(e) => setConfig({ limit: Number(e.target.value) })}
      />
    </FormField>
  );
};

export default LinearTriageFetchConfig;
