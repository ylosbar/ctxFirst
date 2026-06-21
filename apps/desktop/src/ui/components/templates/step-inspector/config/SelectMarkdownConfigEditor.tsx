import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type SelectMarkdownConfigEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Inline editor for a `select.markdown` step: a single JSONPath (`path`) read
 * from the `cond` input. Unlike {@link BranchJsonConfigEditor} there are no
 * cases — the node always produces on its sole `out` port (the `value`
 * fragment when the path is truthy, empty Markdown otherwise).
 */
const SelectMarkdownConfigEditor = ({
  config,
  setConfig,
}: SelectMarkdownConfigEditorProps) => {
  const t = useT();
  const path = (config["path"] as string | undefined) ?? "";

  return (
    <FormField
      label={t("template.stepInspector.selectMarkdown.path.label")}
      description={t("template.stepInspector.selectMarkdown.path.description")}
    >
      <BufferedInput
        className="font-mono text-xs"
        placeholder="$.flag"
        value={path}
        onChange={(e) => setConfig({ path: e.target.value })}
      />
    </FormField>
  );
};

export default SelectMarkdownConfigEditor;
