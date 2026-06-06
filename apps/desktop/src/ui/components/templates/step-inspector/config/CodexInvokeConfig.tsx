import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useT } from "../../../../i18n";

type CodexInvokeConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const CodexInvokeConfig = ({ config, setConfig }: CodexInvokeConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.codex.model")}>
        <Input
          value={(config["model"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ model: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.fields.maxTokens")}>
        <Input
          type="number"
          min={1}
          value={(config["maxTokens"] as number | undefined) ?? 8000}
          onChange={(e) =>
            setConfig({ maxTokens: Number(e.target.value) })
          }
        />
      </FormField>
    </>
  );
};

export default CodexInvokeConfig;
