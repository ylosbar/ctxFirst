import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
      <FormField label={t("template.stepInspector.concat.separator")}>
        <Input
          placeholder="\n\n"
          value={(config["separator"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ separator: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.concat.order.label")}>
        <Select
          value={(config["order"] as string | undefined) ?? "top-to-bottom"}
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
            const setEntry = (patch: { header?: string; footer?: string }) => {
              const prev =
                (config["entries"] as Record<string, unknown> | undefined) ?? {};
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
                    onChange={(e) => setEntry({ header: e.target.value })}
                  />
                </FormField>
                <FormField label={t("template.stepInspector.concat.perEntry.footer")}>
                  <Textarea
                    size="sm"
                    className="min-h-[40px]"
                    value={entry?.footer ?? ""}
                    onChange={(e) => setEntry({ footer: e.target.value })}
                  />
                </FormField>
              </div>
            );
          },
        )}
      </Section>
    </>
  );
};

export default ConcatMarkdownConfig;
