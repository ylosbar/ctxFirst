import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import useParsers from "../../../../hooks/useParsers";
import { useT } from "../../../../i18n";

type TransformRunConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const TransformRunConfig = ({ config, setConfig }: TransformRunConfigProps) => {
  const t = useT();
  const { parsers, loading } = useParsers(null);
  const rawRef = config["transformRef"];
  const ref =
    rawRef && typeof rawRef === "object"
      ? (rawRef as { id?: unknown; version?: unknown })
      : {};
  const refKey =
    typeof ref.id === "string" && typeof ref.version === "string" && ref.id
      ? `${ref.id}@${ref.version}`
      : "";

  return (
    <FormField
      label={t("template.stepInspector.transform.parser.label")}
      description={t("template.stepInspector.transform.parser.description")}
    >
      <Select
        value={refKey}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            setConfig({ transformRef: { id: "", version: "" } });
            return;
          }
          const [id, version] = v.split("@");
          setConfig({ transformRef: { id, version } });
        }}
      >
        <option value="">
          {loading
            ? t("template.stepInspector.transform.loading")
            : t("template.stepInspector.transform.choose")}
        </option>
        {parsers.map((p) => {
          const key = `${p.id}@${p.version}`;
          const target = `${p.forType.id}@${p.forType.version}`;
          const sourceTag =
            p.source.kind === "plugin"
              ? `plugin:${p.source.pluginId}`
              : "user";
          return (
            <option key={key} value={key}>
              {t("template.stepInspector.transform.parserOption", { key, target, sourceTag })}
            </option>
          );
        })}
      </Select>
    </FormField>
  );
};

export default TransformRunConfig;
