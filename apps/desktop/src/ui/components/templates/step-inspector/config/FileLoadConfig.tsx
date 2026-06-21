import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedInput } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import type { ArtifactKind } from "../../../../../domain/workflow/types";
import { useServices } from "../../../../di/services-provider";
import { useT } from "../../../../i18n";
import KindPreviewBlock from "../../../artifact-kinds/KindPreviewBlock";
import { FILE_LOAD_OUTPUT_KINDS } from "../parts/inspector-constants";

type FileLoadConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const FileLoadConfig = ({ config, setConfig }: FileLoadConfigProps) => {
  const t = useT();
  const services = useServices();

  const pickFilePath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickFile({
      defaultPath: current || undefined,
      title: t("template.stepInspector.filePicker.title"),
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
        { name: "JSON", extensions: ["json"] },
        {
          name: t("template.stepInspector.filePicker.allFiles"),
          extensions: ["*"],
        },
      ],
    });
    if (picked) setConfig({ path: picked });
  };

  return (
    <>
      <FormField
        label={t("template.stepInspector.fileLoad.path.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.fileLoad.path.description"
            components={{ code: <code /> }}
          />
        }
      >
        <div className="flex items-center gap-2">
          <BufferedInput
            className="font-mono"
            placeholder="/chemin/absolu/vers/data.json"
            value={(config["path"] as string | undefined) ?? ""}
            onChange={(e) => setConfig({ path: e.target.value })}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={pickFilePath}
          >
            {t("template.stepInspector.browse")}
          </Button>
        </div>
      </FormField>
      <FormField
        label={t("template.stepInspector.fileLoad.outputKind.label")}
        description={t(
          "template.stepInspector.fileLoad.outputKind.description",
        )}
      >
        <Select
          value={(config["outputKind"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ outputKind: e.target.value })}
        >
          {FILE_LOAD_OUTPUT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        {typeof config["outputKind"] === "string" &&
        config["outputKind"] ? (
          <KindPreviewBlock
            kind={config["outputKind"] as ArtifactKind}
            className="mt-2"
          />
        ) : null}
      </FormField>
    </>
  );
};

export default FileLoadConfig;
