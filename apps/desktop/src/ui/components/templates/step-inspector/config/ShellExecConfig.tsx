import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";
import ShellExecExitCodeEditor, {
  type ExitCodesConfig,
} from "../../ShellExecExitCodeEditor";

type ShellExecConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const ShellExecConfig = ({ config, setConfig }: ShellExecConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField label={t("template.stepInspector.shellExec.command")}>
        <Textarea
          size="sm"
          className="min-h-[60px] font-mono"
          placeholder={
            (config["useShell"] === true
              ? "yarn tsc --noEmit"
              : "yarn") + ""
          }
          value={
            typeof config["command"] === "string"
              ? (config["command"])
              : Array.isArray(config["command"])
                ? (config["command"] as ReadonlyArray<string>).join(" ")
                : ""
          }
          onChange={(e) => setConfig({ command: e.target.value })}
        />
      </FormField>

      <FormField
        orientation="inline"
        label={t("template.stepInspector.shellExec.useShell")}
      >
        <Checkbox
          checked={config["useShell"] === true}
          onCheckedChange={(v) => setConfig({ useShell: v })}
        />
      </FormField>

      <FormField label={t("template.stepInspector.shellExec.subdir.label")}>
        <Input
          className="font-mono"
          placeholder={t("template.stepInspector.shellExec.subdir.placeholder")}
          value={(config["subdir"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ subdir: e.target.value })}
        />
      </FormField>

      <FormField label={t("template.stepInspector.shellExec.timeout")}>
        <Input
          type="number"
          min={1000}
          max={600000}
          value={(config["timeoutMs"] as number | undefined) ?? 60000}
          onChange={(e) =>
            setConfig({ timeoutMs: Number(e.target.value) })
          }
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.shellExec.maxOutput.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.shellExec.maxOutput.description"
            components={{ code: <code /> }}
          />
        }
      >
        <Input
          type="number"
          min={1}
          value={Math.round(
            ((config["maxOutputBytes"] as number | undefined) ??
              256 * 1024) / 1024,
          )}
          onChange={(e) =>
            setConfig({ maxOutputBytes: Number(e.target.value) * 1024 })
          }
        />
      </FormField>

      <FormField
        orientation="inline"
        label={t("template.stepInspector.shellExec.customExitCodes.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.shellExec.customExitCodes.description"
            components={{ code: <code /> }}
          />
        }
      >
        <Checkbox
          checked={config["exitCodes"] !== undefined}
          onCheckedChange={(v) => {
            if (v) {
              setConfig({
                exitCodes: { ok: [0], other: "*" },
              });
            } else {
              setConfig({ exitCodes: undefined });
            }
          }}
        />
      </FormField>

      {config["exitCodes"] !== undefined ? (
        <ShellExecExitCodeEditor
          value={config["exitCodes"] as ExitCodesConfig}
          onChange={(next) => setConfig({ exitCodes: next })}
        />
      ) : null}
    </>
  );
};

export default ShellExecConfig;
