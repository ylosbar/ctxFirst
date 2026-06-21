import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedInput } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";
import { FILE_LOAD_OUTPUT_KINDS } from "../parts/inspector-constants";

type FilesLoadManifestConfigEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Config editor for a `files.load-manifest` step. Unlike `files.load` (static
 * slots), the file list is read at runtime from a JSONPath `selector` over the
 * `source` input; the other fields tune resolution (`subdir`), per-file read
 * type (`outputKind`), wrapping (`wrap.header`/`wrap.footer`, `{name}`
 * placeholder), joining (`separator`), de-duplication and missing-file policy.
 */
const FilesLoadManifestConfigEditor = ({
  config,
  setConfig,
}: FilesLoadManifestConfigEditorProps) => {
  const t = useT();
  const wrap = (config["wrap"] as Record<string, unknown> | undefined) ?? {};
  const setWrap = (patch: Record<string, unknown>) =>
    setConfig({ wrap: { ...wrap, ...patch } });
  const maxFiles = config["maxFiles"];

  return (
    <>
      <FormField
        label={t("template.stepInspector.filesLoadManifest.selector.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.filesLoadManifest.selector.description"
            components={{ code: <code /> }}
          />
        }
      >
        <BufferedInput
          className="font-mono text-xs"
          placeholder="$.mockups[*].transcription"
          value={(config["selector"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ selector: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.subdir.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.subdir.description",
        )}
      >
        <BufferedInput
          className="font-mono text-xs"
          placeholder="product_requirements/looker-studio/mockups"
          value={(config["subdir"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ subdir: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.outputKind.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.outputKind.description",
        )}
      >
        <Select
          value={(config["outputKind"] as string | undefined) ?? "Json"}
          onChange={(e) => setConfig({ outputKind: e.target.value })}
        >
          {FILE_LOAD_OUTPUT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.wrap.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.filesLoadManifest.wrap.description"
            components={{ code: <code /> }}
          />
        }
      >
        <div className="flex flex-col gap-1.5">
          <BufferedInput
            className="font-mono text-xs"
            placeholder='<transcript file="{name}">'
            value={(wrap["header"] as string | undefined) ?? ""}
            onChange={(e) => setWrap({ header: e.target.value })}
          />
          <BufferedInput
            className="font-mono text-xs"
            placeholder="</transcript>"
            value={(wrap["footer"] as string | undefined) ?? ""}
            onChange={(e) => setWrap({ footer: e.target.value })}
          />
        </div>
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.separator.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.separator.description",
        )}
      >
        <BufferedInput
          className="font-mono text-xs"
          placeholder="\n\n"
          value={(config["separator"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ separator: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.dedupe.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.dedupe.description",
        )}
      >
        <Checkbox
          checked={config["dedupe"] !== false}
          onCheckedChange={(v) => setConfig({ dedupe: v === true })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.onMissing.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.onMissing.description",
        )}
      >
        <Select
          value={(config["onMissing"] as string | undefined) ?? "fail"}
          onChange={(e) => setConfig({ onMissing: e.target.value })}
        >
          <option value="fail">
            {t("template.stepInspector.filesLoadManifest.onMissing.fail")}
          </option>
          <option value="skip">
            {t("template.stepInspector.filesLoadManifest.onMissing.skip")}
          </option>
        </Select>
      </FormField>

      <FormField
        label={t("template.stepInspector.filesLoadManifest.maxFiles.label")}
        description={t(
          "template.stepInspector.filesLoadManifest.maxFiles.description",
        )}
      >
        <BufferedInput
          type="number"
          min={1}
          className="font-mono text-xs"
          placeholder="∞"
          value={typeof maxFiles === "number" ? String(maxFiles) : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            setConfig({
              maxFiles:
                e.target.value === "" || !Number.isFinite(n) || n <= 0
                  ? undefined
                  : Math.floor(n),
            });
          }}
        />
      </FormField>
    </>
  );
};

export default FilesLoadManifestConfigEditor;
