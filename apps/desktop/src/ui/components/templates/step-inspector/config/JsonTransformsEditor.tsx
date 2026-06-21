import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { BufferedInput } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";
import { CASE_NAME_RE } from "../parts/inspector-constants";

type JsonTransformsEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

type JsonTransformDraft = { port: string; expression: string };

/**
 * Inline editor for `json.transform.transformations`. Each entry materializes
 * one output port (kind Json) carrying the matches of `expression` against the
 * upstream JSON. Order is preserved so the canvas handles match the editor.
 */
const JsonTransformsEditor = ({
  config,
  setConfig,
}: JsonTransformsEditorProps) => {
  const t = useT();
  const raw = config["transformations"];
  const items: JsonTransformDraft[] = Array.isArray(raw)
    ? raw
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          port: typeof t.port === "string" ? t.port : "",
          expression: typeof t.expression === "string" ? t.expression : "",
        }))
    : [];

  const update = (next: JsonTransformDraft[]) =>
    setConfig({ transformations: next });

  const setItem = (index: number, patch: Partial<JsonTransformDraft>) => {
    const next = items.map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    update(next);
  };
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    update(items.filter((_, i) => i !== index));
  };
  const addItem = () => {
    let n = items.length;
    let candidate = `out_${n}`;
    const used = new Set(items.map((it) => it.port));
    while (used.has(candidate)) {
      n += 1;
      candidate = `out_${n}`;
    }
    update([...items, { port: candidate, expression: "$" }]);
  };

  const seen = new Set<string>();
  const portErrors: Array<string | null> = items.map((it) => {
    if (it.port.length === 0) return t("template.stepInspector.validation.emptyName");
    if (!CASE_NAME_RE.test(it.port))
      return t("template.stepInspector.validation.mustMatch", { pattern: String(CASE_NAME_RE) });
    if (seen.has(it.port)) return t("template.stepInspector.validation.duplicate");
    seen.add(it.port);
    return null;
  });
  const exprErrors: Array<string | null> = items.map((it) =>
    it.expression.length === 0 ? t("template.stepInspector.validation.emptyExpression") : null,
  );

  return (
    <FormField
      label={t("template.stepInspector.jsonTransform.projections.label")}
      description={t("template.stepInspector.jsonTransform.projections.description")}
    >
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <BufferedInput
                className="w-32 font-mono text-xs"
                placeholder="port"
                value={it.port}
                onChange={(e) => setItem(i, { port: e.target.value })}
              />
              <BufferedInput
                className="flex-1 font-mono text-xs"
                placeholder="$.foo.bar[*]"
                value={it.expression}
                onChange={(e) => setItem(i, { expression: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
              >
                {t("common.delete")}
              </Button>
            </div>
            {portErrors[i] || exprErrors[i] ? (
              <span className="text-2xs text-destructive">
                {[portErrors[i], exprErrors[i]].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="self-start"
        >
          {t("template.stepInspector.jsonTransform.projections.add")}
        </Button>
      </div>
    </FormField>
  );
};

export default JsonTransformsEditor;
