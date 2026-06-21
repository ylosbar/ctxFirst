import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedInput, BufferedTextarea } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type ConcatMarkdownConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const ConcatMarkdownConfig = ({
  config,
  setConfig,
}: ConcatMarkdownConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.concat.separator")}>
        <BufferedInput
          placeholder="\n\n"
          value={(config["separator"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ separator: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.concat.order.label")}>
        <Select
          value={(config["order"] as string | undefined) ?? "top-to-bottom"}
          onChange={(e) => setConfig({ order: e.target.value })}
        >
          <option value="top-to-bottom">
            {t("template.stepInspector.concat.order.topToBottom")}
          </option>
          <option value="bottom-to-top">
            {t("template.stepInspector.concat.order.bottomToTop")}
          </option>
        </Select>
      </FormField>
      <FormField label={t("template.stepInspector.concat.header")}>
        <BufferedTextarea
          size="sm"
          className="min-h-[40px]"
          value={(config["header"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ header: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.concat.footer")}>
        <BufferedTextarea
          size="sm"
          className="min-h-[40px]"
          value={(config["footer"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ footer: e.target.value })}
        />
      </FormField>
    </>
  );
};

export default ConcatMarkdownConfig;
