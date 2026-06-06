import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Trans } from "react-i18next";
import { useServices } from "../../../../di/services-provider";
import { useT } from "../../../../i18n";
import FilesLoadSlotsEditor from "./FilesLoadSlotsEditor";

type FilesLoadConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const FilesLoadConfig = ({ config, setConfig }: FilesLoadConfigProps) => {
  const t = useT();
  const services = useServices();

  const pickBasePath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickDirectory({
      defaultPath: current || undefined,
    });
    if (picked) setConfig({ path: picked });
  };

  return (
    <>
      <FormField
        label={t("template.stepInspector.filesLoad.basePath.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.filesLoad.basePath.description"
            components={{ code: <code /> }}
          />
        }
      >
        <div className="flex items-center gap-2">
          <Input
            className="font-mono"
            placeholder="/chemin/absolu/vers/dossier"
            value={(config["path"] as string | undefined) ?? ""}
            onChange={(e) => setConfig({ path: e.target.value })}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={pickBasePath}
          >
            {t("template.stepInspector.browse")}
          </Button>
        </div>
      </FormField>
      <FilesLoadSlotsEditor config={config} setConfig={setConfig} />
    </>
  );
};

export default FilesLoadConfig;
