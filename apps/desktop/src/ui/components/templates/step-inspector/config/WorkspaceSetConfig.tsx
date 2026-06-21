import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import { useServices } from "../../../../di/services-provider";
import { useT } from "../../../../i18n";

type WorkspaceSetConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const WorkspaceSetConfig = ({ config, setConfig }: WorkspaceSetConfigProps) => {
  const t = useT();
  const services = useServices();

  const pickCwd = async () => {
    const current = (config["cwd"] as string | undefined) ?? "";
    const picked = await services.pickDirectory({
      defaultPath: current || undefined,
    });
    if (picked) setConfig({ cwd: picked });
  };

  return (
    <FormField
      label={t("template.stepInspector.workspaceSet.cwd.label")}
      description={
        <Trans
          t={t}
          i18nKey="template.stepInspector.workspaceSet.cwd.description"
          components={{ code: <code /> }}
        />
      }
    >
      <div className="flex items-center gap-2">
        <BufferedInput
          className="font-mono"
          placeholder="/chemin/absolu/vers/le/repo"
          value={(config["cwd"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ cwd: e.target.value })}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={pickCwd}
        >
          {t("template.stepInspector.browse")}
        </Button>
      </div>
    </FormField>
  );
};

export default WorkspaceSetConfig;
