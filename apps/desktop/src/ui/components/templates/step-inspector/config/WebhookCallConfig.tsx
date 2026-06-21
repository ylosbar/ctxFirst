import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { BufferedInput, BufferedTextarea } from "../components/buffered-inputs";
import { Trans } from "react-i18next";
import { useT } from "../../../../i18n";

type WebhookCallConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Config editor for a `webhook.call` step. The `outputKind` select is rendered
 * upstream by the generic polymorphism block; this only covers the
 * HTTP-specific knobs. The `url` / `body` ports are wired in the "Câblage"
 * section — the URL fallback / body template here only apply when the matching
 * port is left unwired.
 */
const WebhookCallConfig = ({ config, setConfig }: WebhookCallConfigProps) => {
  const t = useT();
  const method = (config["method"] as string | undefined) ?? "GET";
  const rawHeaders = config["headers"];
  const headers: Record<string, string> =
    rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : {};
  const headerEntries = Object.entries(headers);
  const bodyAllowed = method !== "GET" && method !== "HEAD";

  const setHeaders = (next: Record<string, string>) =>
    setConfig({ headers: Object.keys(next).length > 0 ? next : undefined });

  const setHeaderKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of headerEntries) next[k === oldKey ? newKey : k] = v;
    setHeaders(next);
  };
  const setHeaderValue = (key: string, value: string) =>
    setHeaders({ ...headers, [key]: value });
  const removeHeader = (key: string) => {
    const next = { ...headers };
    delete next[key];
    setHeaders(next);
  };
  const addHeader = () => {
    let i = headerEntries.length;
    let candidate = `Header-${i}`;
    while (candidate in headers) {
      i += 1;
      candidate = `Header-${i}`;
    }
    setHeaders({ ...headers, [candidate]: "" });
  };

  return (
    <>
      <FormField label={t("template.stepInspector.webhook.method")}>
        <Select
          value={method}
          onChange={(e) => setConfig({ method: e.target.value })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={t("template.stepInspector.webhook.urlFallback.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.webhook.urlFallback.description"
            components={{ code: <code /> }}
          />
        }
      >
        <BufferedInput
          className="font-mono"
          placeholder="https://api.example.com/notify"
          value={(config["url"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ url: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.webhook.headers.label")}
        description={t("template.stepInspector.webhook.headers.description")}
      >
        <div className="flex flex-col gap-1.5">
          {headerEntries.map(([key, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <BufferedInput
                className="font-mono text-xs"
                placeholder={t("template.stepInspector.webhook.headers.placeholder")}
                value={key}
                onChange={(e) => setHeaderKey(key, e.target.value)}
              />
              <BufferedInput
                className="font-mono text-xs"
                placeholder={t("template.stepInspector.webhook.headers.valuePlaceholder")}
                value={value}
                onChange={(e) => setHeaderValue(key, e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeHeader(key)}
              >
                {t("common.delete")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addHeader}
            className="self-start"
          >
            {t("template.stepInspector.webhook.headers.add")}
          </Button>
        </div>
      </FormField>

      {bodyAllowed ? (
        <FormField
          label={t("template.stepInspector.webhook.body.label")}
          description={
            <Trans
              t={t}
              i18nKey="template.stepInspector.webhook.body.description"
              components={{ code: <code /> }}
            />
          }
        >
          <BufferedTextarea
            size="sm"
            className="min-h-[60px] font-mono"
            placeholder={'{ "event": "done" }'}
            value={(config["bodyTemplate"] as string | undefined) ?? ""}
            onChange={(e) => setConfig({ bodyTemplate: e.target.value })}
          />
        </FormField>
      ) : null}

      <FormField orientation="inline" label={t("template.stepInspector.webhook.failOnError")}>
        <Checkbox
          checked={config["failOnError"] !== false}
          onCheckedChange={(v) => setConfig({ failOnError: v })}
        />
      </FormField>
    </>
  );
};

export default WebhookCallConfig;
