import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useT } from "../../../../i18n";
import BranchCasesEditor from "./BranchCasesEditor";

type BranchJsonConfigEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Inline editor for a `branch.json` step: a JSONPath (`path`) read from the
 * input artifact plus the `cases[]` that materialize the output ports. The
 * extracted scalar is coerced to a string and compared against each case —
 * exactly one port is produced at runtime.
 *
 * Cases reuse the same `cases: string[]` shape and validation as
 * {@link BranchCasesEditor}; the JSONPath field is added on top.
 */
const BranchJsonConfigEditor = ({
  config,
  setConfig,
}: BranchJsonConfigEditorProps) => {
  const t = useT();
  const path = (config["path"] as string | undefined) ?? "";

  return (
    <>
      <FormField
        label={t("template.stepInspector.branchJson.path.label")}
        description={t("template.stepInspector.branchJson.path.description")}
      >
        <Input
          className="font-mono text-xs"
          placeholder="$.flag"
          value={path}
          onChange={(e) => setConfig({ path: e.target.value })}
        />
      </FormField>
      <BranchCasesEditor
        config={config}
        setConfig={setConfig}
        showVerdictKind={false}
      />
    </>
  );
};

export default BranchJsonConfigEditor;
