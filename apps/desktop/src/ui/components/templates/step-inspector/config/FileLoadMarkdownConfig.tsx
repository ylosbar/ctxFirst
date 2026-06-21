import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import { useServices } from "../../../../di/services-provider";
import { useT } from "../../../../i18n";

type FileLoadMarkdownConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const FileLoadMarkdownConfig = ({
  config,
  setConfig,
}: FileLoadMarkdownConfigProps) => {
  const t = useT();
  const services = useServices();

  const pickMarkdownPath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickFile({
      defaultPath: current || undefined,
      title: t("template.stepInspector.markdownPicker.title"),
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
        {
          name: t("template.stepInspector.markdownPicker.allFiles"),
          extensions: ["*"],
        },
      ],
    });
    if (picked) setConfig({ path: picked });
  };

  return (
    <FormField
      label={t("template.stepInspector.fileLoadMarkdown.path.label")}
      description={
        <Trans
          t={t}
          i18nKey="template.stepInspector.fileLoadMarkdown.path.description"
          components={{ code: <code /> }}
        />
      }
    >
      <div className="flex items-center gap-2">
        <BufferedInput
          className="font-mono"
          placeholder="/chemin/absolu/vers/spec.md"
          value={(config["path"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ path: e.target.value })}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={pickMarkdownPath}
        >
          {t("template.stepInspector.browse")}
        </Button>
      </div>
    </FormField>
  );
};

export default FileLoadMarkdownConfig;
