import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useT } from "../../../../i18n";
import FilesLoadSlotsEditor from "./FilesLoadSlotsEditor";

type GitlabFilesFetchConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const GitlabFilesFetchConfig = ({
  config,
  setConfig,
}: GitlabFilesFetchConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.gitlabFilesFetch.project.label")}
        description={t(
          "template.stepInspector.gitlabFilesFetch.project.description",
        )}
      >
        <Input
          className="font-mono"
          placeholder="group/project"
          value={(config["project"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ project: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabFilesFetch.ref.label")}
        description={t(
          "template.stepInspector.gitlabFilesFetch.ref.description",
        )}
      >
        <Input
          className="font-mono"
          placeholder="main"
          value={(config["ref"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ ref: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabFilesFetch.baseUrl.label")}
        description={t(
          "template.stepInspector.gitlabFilesFetch.baseUrl.description",
        )}
      >
        <Input
          className="font-mono"
          placeholder="https://gitlab.com"
          value={(config["baseUrl"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ baseUrl: e.target.value })}
        />
      </FormField>

      <FormField
        label={t(
          "template.stepInspector.gitlabFilesFetch.basePath.label",
        )}
        description={t(
          "template.stepInspector.gitlabFilesFetch.basePath.description",
        )}
      >
        <Input
          className="font-mono"
          placeholder="docs"
          value={(config["basePath"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ basePath: e.target.value })}
        />
      </FormField>

      <FilesLoadSlotsEditor
        config={config}
        setConfig={setConfig}
        i18nNamespace="gitlabFilesFetch"
      />
    </>
  );
};

export default GitlabFilesFetchConfig;
