import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "../../../../i18n";
import { CASE_NAME_RE } from "../parts/inspector-constants";

type BranchCasesEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
  /**
   * Whether to render the "Verdict kind" select (Markdown-only). `branch.bool`
   * reads a Markdown verdict so it shows it; `branch.json` reuses this editor
   * for the cases list only (its input is JSON), so it hides it.
   */
  showVerdictKind?: boolean;
};

/**
 * Inline editor for the `cases: string[]` config of a `branch.bool` step.
 * Materialized cases drive the node's output ports at runtime (the runner
 * derives `outputs[]` from this array) — the canvas picks the change up
 * automatically through `resolveNodeSpec`.
 *
 * Validation matches the runner-side regex so the user is corrected before
 * save instead of receiving a `StepFailed` at execution time.
 */
const BranchCasesEditor = ({
  config,
  setConfig,
  showVerdictKind = true,
}: BranchCasesEditorProps) => {
  const t = useT();
  const raw = config["cases"];
  const cases: string[] = Array.isArray(raw)
    ? raw.filter((c): c is string => typeof c === "string")
    : [];

  const inputKind = (config["inputKind"] as string | undefined) ?? "Markdown";

  const updateCases = (next: string[]) => setConfig({ cases: next });

  const setCase = (index: number, value: string) => {
    const next = [...cases];
    next[index] = value;
    updateCases(next);
  };
  const removeCase = (index: number) => {
    if (cases.length <= 2) return;
    updateCases(cases.filter((_, i) => i !== index));
  };
  const addCase = () => {
    let i = cases.length;
    let candidate = `case_${i}`;
    while (cases.includes(candidate)) {
      i += 1;
      candidate = `case_${i}`;
    }
    updateCases([...cases, candidate]);
  };

  const seen = new Set<string>();
  const validation: Array<string | null> = cases.map((c) => {
    if (c.length === 0) return t("template.stepInspector.validation.emptyLabel");
    if (!CASE_NAME_RE.test(c))
      return t("template.stepInspector.validation.mustMatch", { pattern: String(CASE_NAME_RE) });
    if (seen.has(c)) return t("template.stepInspector.validation.duplicate");
    seen.add(c);
    return null;
  });

  return (
    <>
      {showVerdictKind ? (
        <FormField
          label={t("template.stepInspector.branch.verdictKind.label")}
          description={t("template.stepInspector.branch.verdictKind.description")}
        >
          <Select
            value={inputKind}
            onChange={(e) => setConfig({ inputKind: e.target.value })}
          >
            <option value="Markdown">{t("template.stepInspector.branch.verdictKind.markdownOption")}</option>
          </Select>
        </FormField>
      ) : null}

      <FormField
        label={t("template.stepInspector.branch.cases.label")}
        description={t("template.stepInspector.branch.cases.description")}
      >
        <div className="flex flex-col gap-1.5">
          {cases.map((c, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono text-xs"
                  value={c}
                  onChange={(e) => setCase(i, e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCase(i)}
                  disabled={cases.length <= 2}
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
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addCase}
            className="self-start"
          >
            {t("template.stepInspector.branch.cases.add")}
          </Button>
        </div>
      </FormField>
    </>
  );
};

export default BranchCasesEditor;
