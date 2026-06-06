import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import { Trans } from "react-i18next";
import useSkills from "../../../../hooks/useSkills";
import { useT } from "../../../../i18n";
import { useWorkbench } from "../../../../workbench/store";

type SkillLoaderConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
  onRequestCreateSkill?: () => void;
};

const SkillLoaderConfig = ({
  config,
  setConfig,
  onRequestCreateSkill,
}: SkillLoaderConfigProps) => {
  const t = useT();
  const workbench = useWorkbench();
  const { skills, loading: skillsLoading } = useSkills();
  const skillRef = (config["skillRef"] as string | undefined) ?? "";
  return (
    <FormField
      label={t("template.stepInspector.skillLoader.skill.label")}
      description={
        <Trans
          t={t}
          i18nKey="template.stepInspector.skillLoader.skill.description"
          components={{ code: <code /> }}
        />
      }
    >
      <Select
        value={skillRef}
        onChange={(e) => {
          if (e.target.value === "__create__") {
            onRequestCreateSkill?.();
            return;
          }
          setConfig({ skillRef: e.target.value });
        }}
      >
        <option value="">
          {skillsLoading
            ? t("template.stepInspector.skillLoader.loading")
            : t("template.stepInspector.skillLoader.choose")}
        </option>
        {skills.map((s) => (
          <option key={s.ref} value={s.ref}>
            {s.ref}
          </option>
        ))}
        <option value="__create__">{t("template.stepInspector.skillLoader.createNew")}</option>
      </Select>
      {skillRef ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 self-start gap-1.5 text-xs"
          onClick={() =>
            workbench.openEditor(`skill://${skillRef}`, { focus: true })
          }
        >
          <ExternalLink className="size-3.5" />
          {t("template.stepInspector.skillLoader.open")}
        </Button>
      ) : null}
    </FormField>
  );
};

export default SkillLoaderConfig;
