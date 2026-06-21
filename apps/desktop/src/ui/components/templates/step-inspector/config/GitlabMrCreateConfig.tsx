import { FormField } from "@/components/ui/form-field";
import { BufferedInput, BufferedTextarea } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type GitlabMrCreateConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const GitlabMrCreateConfig = ({
  config,
  setConfig,
}: GitlabMrCreateConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.gitlabMrCreate.project.label")}
        description={t(
          "template.stepInspector.gitlabMrCreate.project.description",
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
        label={t(
          "template.stepInspector.gitlabMrCreate.sourceBranch.label",
        )}
      >
        <BufferedInput
          className="font-mono"
          placeholder="feature/x"
          value={(config["sourceBranch"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ sourceBranch: e.target.value })}
        />
      </FormField>

      <FormField
        label={t(
          "template.stepInspector.gitlabMrCreate.targetBranch.label",
        )}
      >
        <BufferedInput
          className="font-mono"
          placeholder="main"
          value={(config["targetBranch"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ targetBranch: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabMrCreate.title.label")}
      >
        <BufferedInput
          value={(config["title"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ title: e.target.value })}
        />
      </FormField>

      <FormField
        label={t(
          "template.stepInspector.gitlabMrCreate.description.label",
        )}
      >
        <BufferedTextarea
          size="sm"
          value={(config["description"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ description: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitlabMrCreate.baseUrl.label")}
        description={t(
          "template.stepInspector.gitlabMrCreate.baseUrl.description",
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

export default GitlabMrCreateConfig;
