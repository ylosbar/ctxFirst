import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";

type ConcatMarkdownConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const ConcatMarkdownConfig = ({
  config,
  setConfig,
}: ConcatMarkdownConfigProps) => {
  const t = useT();
  return (
    <>
      <FormField
        label={t("template.stepInspector.concat.mode.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.concat.mode.description"
            values={{ example: "{{name}}" }}
            components={{ code: <code /> }}
          />
        }
      >
        <Select
          value={(config["mode"] as string | undefined) ?? "concat"}
          onChange={(e) => setConfig({ mode: e.target.value })}
        >
          <option value="concat">{t("template.stepInspector.concat.mode.concat")}</option>
          <option value="template">{t("template.stepInspector.concat.mode.template")}</option>
        </Select>
      </FormField>
      <FormField label={t("template.stepInspector.concat.separator")}>
        <Input
          placeholder="\n\n"
          value={(config["separator"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ separator: e.target.value })}
        />
      </FormField>
      {((config["mode"] as string | undefined) ?? "concat") === "concat" ? (
        <FormField label={t("template.stepInspector.concat.order.label")}>
          <Select
            value={
              (config["order"] as string | undefined) ?? "top-to-bottom"
            }
            onChange={(e) => setConfig({ order: e.target.value })}
          >
            <option value="top-to-bottom">
              {t("template.stepInspector.concat.order.topToBottom")}
            </option>
            <option value="bottom-to-top">
              {t("template.stepInspector.concat.order.bottomToTop")}
            </option>
          </Select>
        </FormField>
      ) : (
        <>
          <FormField
            label={t("template.stepInspector.concat.onMissing.label")}
            description={t("template.stepInspector.concat.onMissing.description", { example: "{{name}}" })}
          >
            <Select
              value={
                (config["onMissing"] as string | undefined) ?? "keep"
              }
              onChange={(e) => setConfig({ onMissing: e.target.value })}
            >
              <option value="keep">{t("template.stepInspector.concat.onMissing.keep")}</option>
              <option value="empty">{t("template.stepInspector.concat.onMissing.empty")}</option>
              <option value="error">{t("template.stepInspector.concat.onMissing.error")}</option>
            </Select>
          </FormField>
          <FormField
            label={t("template.stepInspector.concat.onUnused.label")}
            description={t("template.stepInspector.concat.onUnused.description")}
          >
            <Select
              value={
                (config["onUnused"] as string | undefined) ?? "append"
              }
              onChange={(e) => setConfig({ onUnused: e.target.value })}
            >
              <option value="append">
                {t("template.stepInspector.concat.onUnused.append")}
              </option>
              <option value="ignore">{t("template.stepInspector.concat.onUnused.ignore")}</option>
            </Select>
          </FormField>
        </>
      )}
      <FormField label={t("template.stepInspector.concat.header")}>
        <Textarea
          size="sm"
          className="min-h-[40px]"
          value={(config["header"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ header: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.concat.footer")}>
        <Textarea
          size="sm"
          className="min-h-[40px]"
          value={(config["footer"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ footer: e.target.value })}
        />
      </FormField>
      {((config["mode"] as string | undefined) ?? "concat") === "concat" ? (
        <Section
          title={t("template.stepInspector.concat.perEntry.title")}
          description={t("template.stepInspector.concat.perEntry.description")}
          variant="card"
          density="compact"
          collapsible
          defaultOpen={false}
          persistKey="app.step-inspector.concat.per-entry"
        >
          {(["main", "markdown1", "markdown2", "markdown3"] as const).map(
            (port) => {
              const entriesCfg = config["entries"] as
                | Record<string, { header?: string; footer?: string } | undefined>
                | undefined;
              const entry = entriesCfg?.[port];
              const setEntry = (patch: {
                header?: string;
                footer?: string;
              }) => {
                const prev =
                  (config["entries"] as Record<string, unknown> | undefined) ??
                  {};
                const prevPort =
                  (prev[port] as Record<string, unknown> | undefined) ?? {};
                const next = {
                  ...prev,
                  [port]: { ...prevPort, ...patch },
                };
                setConfig({ entries: next });
              };
              return (
                <div
                  key={port}
                  className="space-y-2 border-l-2 border-muted pl-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {port}
                  </p>
                  <FormField label={t("template.stepInspector.concat.perEntry.header")}>
                    <Textarea
                      size="sm"
                      className="min-h-[40px]"
                      value={entry?.header ?? ""}
                      onChange={(e) =>
                        setEntry({ header: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField label={t("template.stepInspector.concat.perEntry.footer")}>
                    <Textarea
                      size="sm"
                      className="min-h-[40px]"
                      value={entry?.footer ?? ""}
                      onChange={(e) =>
                        setEntry({ footer: e.target.value })
                      }
                    />
                  </FormField>
                </div>
              );
            },
          )}
        </Section>
      ) : null}
    </>
  );
};

export default ConcatMarkdownConfig;
