import { FormField } from "@/components/ui/form-field";
import { BufferedInput, BufferedTextarea } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type HumanGateConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const HumanGateConfig = ({ config, setConfig }: HumanGateConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.humanGate.role")}>
        <BufferedInput
          value={(config["role"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ role: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.humanGate.prompt")}>
        <BufferedTextarea
          size="sm"
          className="min-h-[80px]"
          value={(config["prompt"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ prompt: e.target.value })}
        />
      </FormField>
    </>
  );
};

export default HumanGateConfig;
