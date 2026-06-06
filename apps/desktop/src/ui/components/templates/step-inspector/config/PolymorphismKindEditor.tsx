import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { ArtifactKind } from "../../../../../domain/workflow/types";
import { kindForArtifactSchema } from "../../../../../domain/workflow/types";
import useArtifactSchemas from "../../../../hooks/useArtifactSchemas";
import { useT } from "../../../../i18n";
import KindPreviewBlock from "../../../artifact-kinds/KindPreviewBlock";
import { ARTIFACT_KINDS } from "../../step-kinds";
import type { PolymorphismDiscriminator } from "../../step-kinds";

type PolymorphismKindEditorProps = {
  polymorphism: PolymorphismDiscriminator;
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const PolymorphismKindEditor = ({
  polymorphism,
  config,
  setConfig,
}: PolymorphismKindEditorProps) => {
  const t = useT();
  const { types: artifactSchemas } = useArtifactSchemas();
  const currentKind =
    (config[polymorphism.kind] as string | undefined) ?? "";
  const dynamicKinds = artifactSchemas.map((t) => kindForArtifactSchema(t));
  const knownKinds = new Set<string>([
    ...ARTIFACT_KINDS,
    ...dynamicKinds,
  ]);
  const showCurrentOption =
    currentKind.length > 0 && !knownKinds.has(currentKind);
  return (
    <FormField
      label={
        polymorphism.kind === "outputKind"
          ? t("template.stepInspector.polymorphism.outputKindLabel")
          : t("template.stepInspector.polymorphism.inputKindLabel")
      }
      description={t("template.stepInspector.polymorphism.description")}
    >
      <Select
        value={currentKind}
        onChange={(e) => {
          const next = e.target.value as ArtifactKind;
          setConfig({ [polymorphism.kind]: next });
        }}
      >
        <option value="">{t("template.stepInspector.kindSelect.choose")}</option>
        {ARTIFACT_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
        {dynamicKinds.length > 0 ? (
          <optgroup label={t("template.stepInspector.kindSelect.userPlugin")}>
            {dynamicKinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </optgroup>
        ) : null}
        {showCurrentOption ? (
          <option value={currentKind}>
            {t("template.stepInspector.kindSelect.orphan", { kind: currentKind })}
          </option>
        ) : null}
      </Select>
      {currentKind ? (
        <KindPreviewBlock
          kind={currentKind as ArtifactKind}
          className="mt-2"
        />
      ) : null}
    </FormField>
  );
};

export default PolymorphismKindEditor;
