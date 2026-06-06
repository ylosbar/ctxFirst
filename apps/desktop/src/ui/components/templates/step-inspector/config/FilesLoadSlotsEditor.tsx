import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "../../../../i18n";
import {
  CASE_NAME_RE,
  FILE_LOAD_OUTPUT_KINDS,
} from "../parts/inspector-constants";

type FilesLoadSlotsEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
  /**
   * i18n namespace under `template.stepInspector` carrying the `slots.*` keys.
   * `files.load` and `gitlab.files.fetch` share an identical slot shape, so the
   * editor is reused — only the localized labels differ.
   */
  i18nNamespace?: "filesLoad" | "gitlabFilesFetch";
};

type FilesLoadSlotDraft = {
  port: string;
  subpath: string;
  outputKind: string;
};

/**
 * Inline editor for `files.load` / `gitlab.files.fetch` `slots`. Each entry
 * materializes one named output port reading a file (`subpath` joined to the
 * base) and exposing it with the chosen text-envelope kind. Order is preserved
 * so the canvas handles match the editor. Mirrors {@link JsonTransformsEditor},
 * plus a `subpath` column and an `outputKind` select.
 */
const FilesLoadSlotsEditor = ({
  config,
  setConfig,
  i18nNamespace = "filesLoad",
}: FilesLoadSlotsEditorProps) => {
  const t = useT();
  const k = (suffix: string): string =>
    `template.stepInspector.${i18nNamespace}.slots.${suffix}`;
  const raw = config["slots"];
  const items: FilesLoadSlotDraft[] = Array.isArray(raw)
    ? raw
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          port: typeof s.port === "string" ? s.port : "",
          subpath: typeof s.subpath === "string" ? s.subpath : "",
          outputKind:
            typeof s.outputKind === "string" ? s.outputKind : "Markdown",
        }))
    : [];

  const update = (next: FilesLoadSlotDraft[]) => setConfig({ slots: next });

  const setItem = (index: number, patch: Partial<FilesLoadSlotDraft>) => {
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
    update([
      ...items,
      { port: candidate, subpath: "", outputKind: "Markdown" },
    ]);
  };

  const seen = new Set<string>();
  const portErrors: Array<string | null> = items.map((it) => {
    if (it.port.length === 0)
      return t("template.stepInspector.validation.emptyName");
    if (!CASE_NAME_RE.test(it.port))
      return t("template.stepInspector.validation.mustMatch", {
        pattern: String(CASE_NAME_RE),
      });
    if (seen.has(it.port)) return t("template.stepInspector.validation.duplicate");
    seen.add(it.port);
    return null;
  });
  const subpathErrors: Array<string | null> = items.map((it) =>
    it.subpath.trim().length === 0
      ? t("template.stepInspector.validation.emptySubpath")
      : null,
  );

  return (
    <FormField label={t(k("label"))} description={t(k("description"))}>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded border border-input bg-muted/30 p-2"
          >
            <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(k("slotTitle"), { index: i + 1 })}
            </div>
            <div className="flex items-end gap-2">
              <label className="flex w-28 flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground">
                  {t(k("portLabel"))}
                </span>
                <Input
                  className="font-mono text-xs"
                  placeholder={t(k("portPlaceholder"))}
                  value={it.port}
                  onChange={(e) => setItem(i, { port: e.target.value })}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground">
                  {t(k("kindLabel"))}
                </span>
                <Select
                  value={it.outputKind}
                  onChange={(e) => setItem(i, { outputKind: e.target.value })}
                >
                  {FILE_LOAD_OUTPUT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </Select>
              </label>
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
            <label className="flex flex-col gap-0.5">
              <span className="text-2xs text-muted-foreground">
                {t(k("subpathLabel"))}
              </span>
              <Input
                className="w-full font-mono text-xs"
                placeholder={t(k("subpathPlaceholder"))}
                value={it.subpath}
                onChange={(e) => setItem(i, { subpath: e.target.value })}
              />
            </label>
            {portErrors[i] || subpathErrors[i] ? (
              <span className="text-2xs text-destructive">
                {[portErrors[i], subpathErrors[i]].filter(Boolean).join(" · ")}
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
          {t(k("add"))}
        </Button>
      </div>
    </FormField>
  );
};

export default FilesLoadSlotsEditor;
