import { MAX_SUM_VARIANTS } from "@shared/wf/artifact-kind-grammar";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Trans } from "react-i18next";
import { kindForArtifactSchema } from "../../../../../domain/workflow/types";
import useArtifactSchemas from "../../../../hooks/useArtifactSchemas";
import { useT } from "../../../../i18n";
import { ARTIFACT_KINDS } from "../../step-kinds";
import {
  encodeOneOf,
  readBranchMatchVariants,
} from "../parts/branch-match-grammar";

type BranchMatchTargetEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Inline editor for the `targetKind: OneOf<A,B,…>` config of a `branch.match`
 * step. The runner consumes a sum-typed artifact and dispatches on its
 * `variantKind` discriminator; each variant materialises one `out_<variant>`
 * port on the canvas (resolved by `resolveNodeSpec`).
 *
 * The editor maintains a list of variant kinds and rebuilds the canonical
 * `OneOf<…>` string on every change. Intermediate invalid states (empty cell,
 * duplicate variant) are written verbatim so the user can finish typing — the
 * inline validation message + the canvas falling back to the base spec are the
 * two affordances that surface "not yet valid".
 */
const BranchMatchTargetEditor = ({
  config,
  setConfig,
}: BranchMatchTargetEditorProps) => {
  const t = useT();
  const { types: artifactSchemas } = useArtifactSchemas();
  const dynamicKinds = artifactSchemas.map((t) => kindForArtifactSchema(t));
  const knownKinds = new Set<string>([...ARTIFACT_KINDS, ...dynamicKinds]);

  const variants = readBranchMatchVariants(config["targetKind"]);

  const writeVariants = (next: ReadonlyArray<string>) => {
    setConfig({ targetKind: encodeOneOf(next) });
  };

  const setVariant = (index: number, value: string) => {
    const next = [...variants];
    next[index] = value;
    writeVariants(next);
  };
  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    writeVariants(variants.filter((_, i) => i !== index));
  };
  const addVariant = () => {
    if (variants.length >= MAX_SUM_VARIANTS) return;
    writeVariants([...variants, ""]);
  };

  const seen = new Set<string>();
  const validation: Array<string | null> = variants.map((v) => {
    if (v.length === 0) return t("template.stepInspector.validation.emptyVariant");
    if (seen.has(v)) return t("template.stepInspector.validation.duplicate");
    seen.add(v);
    return null;
  });

  return (
    <FormField
      label={t("template.stepInspector.branchMatch.sumType.label")}
      description={
        <Trans
          t={t}
          i18nKey="template.stepInspector.branchMatch.sumType.description"
          values={{ variantPort: "out_<variant>", max: MAX_SUM_VARIANTS }}
          components={{ code: <code /> }}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        {variants.map((v, i) => {
          const showCurrentOption = v.length > 0 && !knownKinds.has(v);
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Select
                  value={v}
                  onChange={(e) => setVariant(i, e.target.value)}
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
                    <option value={v}>{t("template.stepInspector.kindSelect.orphan", { kind: v })}</option>
                  ) : null}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeVariant(i)}
                  disabled={variants.length <= 2}
                >
                  {t("common.delete")}
                </Button>
              </div>
              {validation[i] ? (
                <span className="text-2xs text-destructive">
                  {validation[i]}
                </span>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addVariant}
          disabled={variants.length >= MAX_SUM_VARIANTS}
          className="self-start"
        >
          {t("template.stepInspector.branchMatch.addVariant")}
        </Button>
      </div>
    </FormField>
  );
};

export default BranchMatchTargetEditor;
