import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type GitlabMrMergeConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const GitlabMrMergeConfig = ({
  config,
  setConfig,
}: GitlabMrMergeConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.gitlabMrMerge.project.label")}
        description={t(
          "template.stepInspector.gitlabMrMerge.project.description",
        )}
      >
        <BufferedInput
          className="font-mono"
          placeholder="group/project"
          value={(config["project"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ project: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabMrMerge.iid.label")}
        description={t(
          "template.stepInspector.gitlabMrMerge.iid.description",
        )}
      >
        <BufferedInput
          className="font-mono"
          placeholder="42"
          value={(config["mergeRequestIid"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ mergeRequestIid: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabMrMerge.baseUrl.label")}
        description={t(
          "template.stepInspector.gitlabMrMerge.baseUrl.description",
        )}
      >
        <BufferedInput
          className="font-mono"
          placeholder="https://gitlab.com"
          value={(config["baseUrl"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ baseUrl: e.target.value })}
        />
      </FormField>
    </>
  );
};

export default GitlabMrMergeConfig;
