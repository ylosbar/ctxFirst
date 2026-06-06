import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";

type GitCloneConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const GitCloneConfig = ({ config, setConfig }: GitCloneConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.gitClone.repoUrl.label")}>
        <Input
          className="font-mono"
          placeholder="https://gitlab.com/group/project.git"
          value={(config["repoUrl"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ repoUrl: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.gitClone.baseDir.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.gitClone.baseDir.description"
            components={{ code: <code /> }}
          />
        }
      >
        <Input
          className="font-mono"
          placeholder={t(
            "template.stepInspector.gitClone.baseDir.placeholder",
          )}
          value={(config["baseDir"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ baseDir: e.target.value })}
        />
      </FormField>

      <FormField label={t("template.stepInspector.gitClone.folder.label")}>
        <Input
          className="font-mono"
          placeholder="group/project"
          value={(config["folder"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ folder: e.target.value })}
        />
      </FormField>

      <FormField label={t("template.stepInspector.gitClone.branch.label")}>
        <Input
          className="font-mono"
          placeholder={t(
            "template.stepInspector.gitClone.branch.placeholder",
          )}
          value={(config["branch"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ branch: e.target.value })}
        />
      </FormField>

      <FormField
        orientation="inline"
        label={t("template.stepInspector.gitClone.cleanBefore.label")}
        description={t(
          "template.stepInspector.gitClone.cleanBefore.description",
        )}
      >
        <Checkbox
          checked={config["cleanBefore"] !== false}
          onCheckedChange={(v) => setConfig({ cleanBefore: v })}
        />
      </FormField>
    </>
  );
};

export default GitCloneConfig;
