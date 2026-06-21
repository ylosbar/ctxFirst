import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedTextarea } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";

type MarkdownTemplateConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const MarkdownTemplateConfig = ({
  config,
  setConfig,
}: MarkdownTemplateConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.markdownTemplate.template.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.markdownTemplate.template.description"
            values={{ example: "{{name}}" }}
            components={{ code: <code /> }}
          />
        }
      >
        <BufferedTextarea
          size="sm"
          className="min-h-[120px] font-mono"
          value={(config["template"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ template: e.target.value })}
        />
      </FormField>
      <FormField
        label={t("template.stepInspector.markdownTemplate.onMissing.label")}
        description={t(
          "template.stepInspector.markdownTemplate.onMissing.description",
          { example: "{{name}}" },
        )}
      >
        <Select
          value={(config["onMissing"] as string | undefined) ?? "empty"}
          onChange={(e) => setConfig({ onMissing: e.target.value })}
        >
          <option value="empty">
            {t("template.stepInspector.markdownTemplate.onMissing.empty")}
          </option>
          <option value="keep">
            {t("template.stepInspector.markdownTemplate.onMissing.keep")}
          </option>
          <option value="error">
            {t("template.stepInspector.markdownTemplate.onMissing.error")}
          </option>
        </Select>
      </FormField>
    </>
  );
};

export default MarkdownTemplateConfig;
